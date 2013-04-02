var async = require('async');
var _ = require('underscore');
var extend = require('extend');
var fs = require('fs');
var widget = require(__dirname + '/widget.js');
var async = require('async');
var csv = require('csv');

// GUIDE TO USE
//
// To make it possible to manage snippets on the site, just call the Snippets
// constructor and invoke the aposSnippetMenu local in your menu template.
//
// To make it possible to add a public "snippets page" that presents all snippets
// alphabetically by title with links to drill down to individual snippets and can
// be locked down by tag, paginated, etc., just add the snippets object to the pages
// module via pages.addType(). You probably won't do this with snippets, but you'll
// do it a lot with page types derived from snippets, such as blog and events.
//
// To add a snippets page with an alternate name in the page types menu and
// overrides of some or all templates, set the `name`, `label` and `dirs` options when
// invoking the snippets constructor (note that `/views`, `/public/css`, etc. are
// automatically added as appropriate to directories in `dirs`). Then pass the
// resulting object to addType. You can instantiate snippets as many times as
// you need to.
//
// To create separate snippet repositories that are not visible in each other's
// "manage" dialogs, set the `instance` option. The `instance` option is used to
// set the `type` property in the `aposPages` collection and thus distinguishes
// this data type from all others that are stored as pages (example: "blogPost").
// End users don't see this, so change it only if your "subclass" of
// snippets shouldn't be visible and editable in the same "pool" with others.
//
// Examples: snippets, blog posts and events are all separate conceptually and
// should have separate settings for `instance`, while "faculty blogs" are just
// an alternate presentation of the blog with some template overrides via the
// `dirs` option and should be able to find the usual pool of blog posts.
//
// You can override any methods whose behavior you wish to modify with extend().
// Notable possibilities include:
//
// `beforeInsert` receives the req object, the data source (req.body for the
// common case, but from elsewhere in the importer), a snippet about to be inserted for
// the first time, and a callback. Modify it to add additional fields, then invoke the
// callback with a fatal error if any. Always sanitize rather than failing
// if it is in any way possible. You receive both the req object and the data
// source because the data source is not req.body in every case (for instance, a
// bulk import uploaded as a file).
//
// `beforeUpdate` performs the same function for updates.
//
// `beforeDelete` gives you a chance to clean up related content when a snippet
// is about to be deleted.
//
// `getDefaultTitle` returns the title used for a new snippet if no title is given.

// To use the snippets modules directly just take advantage of the convenience
// function it exports and you can skip typing 'new':
//
// var snippets = require('apostrophe-snippets')(options, function(err) { ... });
//
// To access the constructor function for use in an object that extends
// snippets, you would write:
//
// var snippets = require('apostrophe-snippets');
// ... Inside the constructor for the new object ...
// snippets.Snippets.call(this, options, null);

module.exports = snippets;

// A mapping of all snippet types by instance type, for use in locating
// types that are compatible with various instance types. For instance,
// if three variations on a blog are registered, all with the instance
// option set to blogPost, then typesByBlogPost.blogPost will be an array
// of those three type objects

var typesByInstanceType = {};

function snippets(options, callback) {
  return new snippets.Snippets(options, callback);
}

snippets.Snippets = function(options, callback) {
  var self = this;
  // These are "public" so the object can be passed directly to pages.addType
  self.name = options.name || 'snippets';
  self.label = options.label || 'Snippets';

  // "Protected" properties. We want modules like the blog to be able
  // to access these, thus no variables defined in the closure
  self._apos = options.apos;
  self._pages = options.pages;
  self._app = options.app;
  self._options = options;
  self._dirs = (options.dirs || []).concat([ __dirname ]);
  self._webAssetDir = options.webAssetDir || __dirname;
  // The type property of the page object used to store the snippet, also
  // passed to views for use in CSS classes etc. Should be camel case. These
  // page objects will not have slugs beginning with /
  self._instance = options.instance || 'snippet';
  // Hyphenated, all lowercase version of same, for CSS classes, permission names, URLs
  self._css = self._apos.cssName(self._instance);
  self._menuName = options.menuName;
  // All partials generated via self.renderer can see these properties
  self._rendererGlobals = options.rendererGlobals || {};

  if (!typesByInstanceType[self._instance]) {
    typesByInstanceType[self._instance] = [];
  }
  typesByInstanceType[self._instance].push(self);

  if (!self._menuName) {
    self._menuName = 'apos' + self._apos.capitalizeFirst(self._instance) + 'Menu';
  }

  self._action = '/apos-' + self._css;

  self.pushAsset = function(type, name) {
    if (type === 'template') {
      // Render templates in our own nunjucks context
      self._apos.pushAsset('template', self.renderer(name));
    } else {
      return self._apos.pushAsset(type, name, self._webAssetDir, self._action);
    }
  };

  // Sanitize newly submitted page settings (never trust a browser)
  extend(self, {
    settings: {
      sanitize: function(data, callback) {
        var ok = {};
        ok.tags = self._apos.sanitizeTags(data.tags);
        return callback(null, ok);
      }
    }
  }, true);

  self.getDefaultTitle = function() {
    return 'My Snippet';
  };

  self._app.post(self._action + '/insert', function(req, res) {
    var snippet;
    var title;
    var content;
    var slug;
    var tags;

    title = req.body.title.trim();
    // Validation is annoying, automatic cleanup is awesome
    if (!title.length) {
      title = self.getDefaultTitle();
    }
    slug = self._apos.slugify(title);

    content = JSON.parse(req.body.content);
    self._apos.sanitizeItems(content);

    tags = req.body.tags;

    async.series([ permissions, prepare, insert ], send);

    function permissions(callback) {
      return self._apos.permissions(req, 'edit-' + self._instance, null, function(err) {
        // If there is no permissions error then we are cool
        // enough to create a post
        return callback(err);
      });
    }

    function prepare(callback) {
      snippet = { title: title, type: self._instance, tags: tags, areas: { body: { items: content } }, slug: slug, createdAt: new Date(), publishedAt: new Date() };
      snippet.sortTitle = self._apos.sortify(snippet.title);
      return self.beforeInsert(req, req.body, snippet, callback);
    }

    function insert(callback) {
      return self._apos.putPage(slug, snippet, callback);
    }

    function send(err) {
      if (err) {
        res.statusCode = 500;
        return res.send('error');
      }
      return res.send(JSON.stringify(snippet));
    }
  });

  self.beforeInsert = function(req, data, snippet, callback) {
    return callback(null);
  };

  self.beforeUpdate = function(req, data, snippet, callback) {
    return callback(null);
  };

  self._app.post(self._action + '/update', function(req, res) {
    var snippet;
    var title;
    var content;
    var originalSlug;
    var slug;
    var tags;

    title = self._apos.sanitizeString(req.body.title, self.getDefaultTitle());

    tags = req.body.tags;

    originalSlug = self._apos.sanitizeString(req.body.originalSlug);
    slug = self._apos.slugify(req.body.slug);
    if (!slug.length) {
      slug = originalSlug;
    }

    content = JSON.parse(req.body.content);
    self._apos.sanitizeItems(content);

    async.series([ getSnippet, permissions, massage, update, redirect ], send);

    function getSnippet(callback) {
      self._apos.getPage(req, originalSlug, function(err, page) {
        if (err) {
          return callback(err);
        }
        if (!page) {
          return callback('No such ' + self._instance);
        }
        if (page.type !== self._instance) {
          return callback('Not a ' + self._instance);
        }
        snippet = page;
        return callback(null);
      });
    }

    function permissions(callback) {
      return self._apos.permissions(req, 'edit-' + self._instance, snippet, function(err) {
        // If there is no permissions error then we are cool
        // enough to create a snippet
        return callback(err);
      });
    }

    function massage(callback) {
      snippet.title = title;
      snippet.slug = slug;
      snippet.tags = tags;
      snippet.sortTitle = self._apos.sortify(title);
      snippet.areas = { body: { items: content } };
      return self.beforeUpdate(req, req.body, snippet, callback);
    }

    function update(callback) {
      self._apos.putPage(originalSlug, snippet, callback);
    }

    function redirect(callback) {
      self._apos.updateRedirect(originalSlug, slug, callback);
    }

    function send(err) {
      if (err) {
        res.statusCode = 500;
        console.log(err);
        return res.send('error');
      }
      return res.send(JSON.stringify(snippet));
    }
  });

  self._app.post(self._action + '/delete', function(req, res) {

    async.series([ get, permissions, beforeDelete, deleteSnippet], respond);

    var slug;
    var snippet;

    function get(callback) {
      slug = req.body.slug;
      return self._apos.getPage(req, slug, function(err, snippetArg) {
        snippet = snippetArg;
        if(!snippet) {
          return callback('Not Found');
        }
        if (snippet.type !== self._instance) {
          return callback('Not a ' + self._instance);
        }
        return callback(err);
      });
    }

    function permissions(callback) {
      return self._apos.permissions(req, 'delete-' + self._instance, snippet, function(err) {
        // If there is no permissions error then we are cool
        // enough to delete the post
        return callback(err);
      });
    }

    function beforeDelete(callback) {
      if (self.beforeDelete) {
        return self.beforeDelete(req, snippet, callback);
      }
      return callback(null);
    }

    function deleteSnippet(callback) {
      self._apos.pages.remove({slug: snippet.slug}, callback);
    }

    function respond(err) {
      if (err) {
        return res.send(JSON.stringify({
          status: err
        }));
      }
      return res.send(JSON.stringify({
        status: 'ok'
      }));
    }
  });

  self._app.post(self._action + '/import', function(req, res) {
    var file = req.files.file;
    var rows = 0;
    var headings = [];
    var s = csv().from.stream(fs.createReadStream(file.path));
    var active = 0;
    s.on('record', function(row, index) {
      active++;
      // s.pause() avoids an explosion of rows being processed simultaneously
      // by async mongo calls, etc. However note this does not
      // stop more events from coming in because the parser will
      // keep going with its current block of raw data. So we still
      // have to track the number of still-active async handleRow calls ):
      // Also there is no guarantee imports are in order, however that shouldn't
      // matter since we always rely on some index such as title or publication date
      s.pause();
      if (!index) {
        handleHeadings(row, afterRow);
      } else {
        handleRow(row, function(err) {
          if (!err) {
            rows++;
            return afterRow();
          } else {
            console.log(err);
            s.end();
          }
        });
      }
      function afterRow() {
        s.resume();
        active--;
      }
    })
    .on('error', function(count) {
      respondWhenDone('error');
    })
    .on('end', function(count) {
      respondWhenDone('ok');
    });

    function handleHeadings(row, callback) {
      headings = row;
      var i;
      for (i = 0; (i < headings.length); i++) {
        headings[i] = self._apos.camelName(headings[i]);
      }
      return callback();
    }

    function handleRow(row, callback) {
      var data = {};
      var i;
      for (i = 0; (i < headings.length); i++) {
        data[headings[i]] = row[i];
      }
      self.importCreateItem(req, data, callback);
    }

    function respondWhenDone(status) {
      if (active) {
        return setTimeout(function() { respondWhenDone(status); }, 100);
      }
      res.send({ status: status, rows: rows });
    }
  });

  self.importCreateItem = function(req, data, callback) {
    // "Why the try/catch?" Because the CSV reader has some sort of
    // try/catch of its own that is making it impossible to log any
    // errors if we don't catch them. TODO: go looking for that and fix it.
    try {
      var tags = '';
      tags = self._apos.sanitizeString(data.tags);
      tags = self._apos.tagsToArray(tags);
      var categories = self._apos.sanitizeString(data.categories);
      categories = self._apos.tagsToArray(categories);
      tags = tags.concat(categories);

      var snippet = {
        type: self._instance,
        areas: {
          body: {
            items: [
              {
                type: 'richText',
                content: data.richText || (data.text ? self._apos.escapeHtml(data.text) : '')
              }
            ]
          }
        },
        title: data.title || self.getDefaultTitle(),
        tags: tags
      };
      snippet.slug = self._apos.slugify(snippet.title);
      snippet.sortTitle = self._apos.sortify(snippet.title);
      self.beforeInsert(req, data, snippet, function(err) {
        if (err) {
          return callback(err);
        }
        return self.importSaveItem(snippet, callback);
      });
    } catch (e) {
      console.log(e);
      throw e;
    }
  };

  self.importSaveItem = function(snippet, callback) {
    self._apos.putPage(snippet.slug, snippet, callback);
  };

  self._app.get(self._action + '/get', function(req, res) {
    self.get(req, req.query, function(err, snippets) {
      return res.send(JSON.stringify(snippets));
    });
  });

  self._app.get(self._action + '/get-one', function(req, res) {
    self.get(req, req.query, function(err, snippets) {
      if (snippets && snippets.length) {
        res.send(JSON.stringify(snippets[0]));
      } else {
        res.send(JSON.stringify(null));
      }
    });
  });

  self._app.get(self._action + '/autocomplete', function(req, res) {
    var options = {
      fields: { title: 1, _id: 1 },
      limit: 10
    };
    if (req.query.term !== undefined) {
      options.titleSearch = req.query.term;
    } else if (req.query.ids !== undefined) {
      options._id = { $in: req.query.ids };
    } else {
      res.statusCode = 404;
      return res.send('bad arguments');
    }
    // Format it as value & id properties for compatibility with jquery UI autocomplete
    self.get(req, options, function(err, snippets) {
      return res.send(
        JSON.stringify(_.map(snippets, function(snippet) {
            return { value: snippet.title, id: snippet._id };
        }))
      );
    });
  });

  // Serve our assets. This is the final route so it doesn't
  // beat out the rest.
  //
  // You don't override js and stylesheet assets, rather you serve more of them
  // from your own module and enhance what's already in browserland
  self._app.get(self._action + '/*', self._apos.static(self._webAssetDir + '/public'));

  self._apos.addLocal(self._menuName, function(args) {
    var result = self.render('menu', args);
    return result;
  });

  // Render a partial, looking for overrides in our preferred places
  self.render = function(name, data) {
    return self.renderer(name)(data);
  };

  // Return a function that will render a particular partial looking for overrides in our
  // preferred places. Also merge in any properties of self._rendererGlobals, which can
  // be set via the rendererGlobals option when the module is configured

  self.renderer = function(name) {
    return function(data) {
      if (!data) {
        data = {};
      }
      _.defaults(data, self._rendererGlobals);
      return self._apos.partial(name, data, _.map(self._dirs, function(dir) { return dir + '/views'; }));
    };
  };

  // Returns recent snippets the current user is permitted to read, in
  // alphabetical order by title. If options.editable is true, only
  // snippets the current user can edit are returned. If options.sort is
  // present, it is passed to mongo's sort() method. All other properties of
  // options are merged with the MongoDB criteria object used to
  // select the relevant snippets. If options.sort is present, it is passed
  // as the argument to the MongoDB sort() function, replacing the
  // default alpha sort. optionsArg may be skipped.
  //
  // options.limit indicates the maximum number of results.
  //
  // If options.fields is present it is used to limit the fields returned
  // by MongoDB for performance reasons (the second argument to MongoDB's find()).
  //
  // options.titleSearch is used to search the titles of all snippets for a
  // particular string using a fairly tolerant algorithm.

  self.get = function(req, optionsArg, callback) {
    if (!callback) {
      callback = optionsArg;
      optionsArg = {};
    }

    var options = {};
    extend(options, optionsArg, true);

    // Consume special options then remove them, turning the rest into mongo criteria

    var editable = options.editable;
    if (options.editable !== undefined) {
      delete options['editable'];
    }

    var sort = options.sort || { sortTitle: 1 };
    if (options.sort !== undefined) {
      delete options['sort'];
    }

    var limit = options.limit || undefined;
    if (limit !== undefined) {
      delete options['limit'];
    }

    var skip = options.skip || undefined;
    if (skip !== undefined) {
      delete options['skip'];
    }

    var fields = options.fields || undefined;
    if (options.fields !== undefined) {
      delete options['fields'];
    }

    var titleSearch = options.titleSearch || undefined;
    if (options.titleSearch !== undefined) {
      delete options['titleSearch'];
      options.sortTitle = new RegExp(RegExp.quote(self._apos.sortify(titleSearch)));
    }

    options.type = self._instance;

    args = {};

    if (fields !== undefined) {
      args.fields = fields;
    }


    // TODO: with many snippets there is a performance problem with calling
    // permissions separately on them. Pagination will have to be performed
    // manually after all permissions have been checked. The A1.5 permissions
    // model wasn't perfect but it was something you could do by joining tables.

    var q = self._apos.pages.find(options, args).sort(sort);
    if (limit !== undefined) {
      q.limit(limit);
    }
    if (skip !== undefined) {
      q.skip(skip);
    }

    var snippets;
    async.series([loadSnippets, permissions, loadWidgets], done);

    function loadSnippets(callback) {
      q.toArray(function(err, snippetsArg) {
        snippets = snippetsArg;
        return callback(err);
      });
    }

    function permissions(callback) {
      async.filter(snippets, function(snippet, callback) {
        self._apos.permissions(req, editable ? 'edit-' + self._css : 'view-' + self._css, snippet, function(err) {
          return callback(!err);
        });
      }, function(snippetsArg) {
        snippets = snippetsArg;
        return callback(null);
      });
    }

    function loadWidgets(callback) {
      // Use eachSeries to avoid devoting overwhelming mongodb resources
      // to a single user's request. There could be many snippets on this
      // page, and callLoadersForPage is parallel already
      async.eachSeries(snippets, function(snippet, callback) {
        self._apos.callLoadersForPage(req, snippet, callback);
      }, function(err) {
        return callback(err);
      });
    }

    function done(err) {
      return callback(null, snippets);
    }
  };

  // This is a loader function, for use with the `load` option of
  // the pages module's `serve` method.
  //
  // If the page type group is not "snippet" (or as overridden via self._instance),
  // self loader does nothing.
  //
  // Otherwise, if the page matches the URL
  // exactly, self function serves up the "main index" page of the snippet
  // repository (a list of snippets in alphabetical in blog order).
  //
  // If the page is an inexact match, self function looks at the remainder of the
  // URL to decide what to do. If the remainder is a slug, the snippet with that
  // slug is served (a "permalink page").
  //
  // "Why would you want to make snippets public like self?" You wouldn't. But in
  // a module that inherits from self one, like the blog module, self is the starting
  // point for serving up blogs and permalink pages.

  self.loader = function(req, callback) {
    async.series([permissions, go], callback);

    function permissions(callback) {
      // Does self person have any business editing snippets? If so make that
      // fact available to templates so they can offer buttons to access
      // the admin interface conveniently
      self._apos.permissions(req, 'edit-' + self._css, null, function(err) {
        var permissionName = 'edit' + self._apos.capitalizeFirst(self._instance);
        req.extras[permissionName] = !err;
        return callback(null);
      });
    }

    function go(callback) {
      if (!req.bestPage) {
        return callback(null);
      }

      // If the page type doesn't share our instance name
      // this page isn't relevant for us
      var type = self._pages.getType(req.bestPage.type);
      if ((!type) || (type._instance !== self._instance)) {
        return callback(null);
      }

      // We consider a partial match to be good enough, depending on the
      // remainder of the URL
      req.page = req.bestPage;

      self.dispatch(req, callback);
    }
  };

  // Decide what to do based on the remainder of the URL. The default behavior
  // is to display an index of snippets if there is nothing further in the URL
  // after the page itself, and to look for a snippets with a slug matching the
  // rest of the URL if there is.
  //
  // Often overridden when subclassing. For instance, the blog places the publication
  // date in the URL before the slug of the post, just to make things feel bloggier.
  //
  self.dispatch = function(req, callback) {
    var permalink = false;
    var criteria = {};
    if (req.remainder.length) {
      // Perhaps it's a snippet permalink
      criteria.slug = req.remainder.substr(1);
      permalink = true;
    }

    if (req.page.typeSettings && req.page.typeSettings.tags && req.page.typeSettings.tags.length) {
      criteria.tags = { $in: req.page.typeSettings.tags };
    }
    self.get(req, criteria, function(err, snippets) {
      if (err) {
        return callback(err);
      }
      if (permalink) {
        if (!snippets.length) {
          req.template = 'notfound';
        } else {
          req.template = self.renderer('show');
          // Generic noun so we can more easily inherit templates
          req.extras.item = snippets[0];
        }
      } else {
        req.template = self.renderer('index');
        // Generic noun so we can more easily inherit templates
        req.extras.items = snippets;
      }
      return callback(null);
    });
  };


  // When a snippet (such as a blog post by Dave) appears as a callout on another
  // page, there is a need to create a suitable permalink back to its page of origin
  // (i.e. "Dave's Blog"). But blog posts don't have pages of origin (they are not
  // "child pages" of a blog page). They do, however, have metadata (tags etc.) and
  // so do blog pages. The findBestPage method accepts the page representing an
  // individual blog post or similar object and a callback. This method will
  // identify the navigable page that best matches the metadata of the snippet. The
  // type of the page returned will always be one that was configured with
  // the same instance type.
  //
  // The first argument to the callback is err, the second (if no error) is the
  // page found or, if no page is found, null. Note that a complete lack of
  // suitable pages is not an error.
  //
  // Only pages that are reachable via a URL (pages with a slug beginning with /) and
  // visible to the current user (req.user, if any) are considered in this search.
  //
  // Strategy: since a single site rarely has thousands of separate "blogs," it is
  // reasonable to fetch all the blogs and compare their metadata to the item. However
  // to maximize performance information about the pages examined is retained in
  // req.bestPageCache for the lifetime of the request so that many calls for many
  // snippets do not result in an explosion of database activity on behalf of a
  // single request.
  //
  // The scoring algorithm was ported directly from Apostrophe 1.5's aEngineTools class.

  self.findBestPage = function(req, snippet, callback) {
    var typeNames = _.map(typesByInstanceType[snippet.type] || [], function(type) { return type.name; });
    var pages = self._apos.pages.find({ type: { $in: typeNames }, slug: /^\// }).toArray(function(err, pages) {
      if (err) {
        console.log('error is:');
        console.log(err);
        return callback(err);
      }
      // Play nice with invocations of findBestPage for other types
      // as part of the same request
      if (!req.bestPageCache) {
        req.bestPageCache = {};
      }
      if (!req.bestPageCache[snippet.type]) {
        var viewable = [];
        async.eachSeries(pages, function(page, callback) {
          self._apos.permissions(req, 'view-page', page, function(err) {
            if (!err) {
              viewable.push(page);
            }
            return callback(null);
          });
        }, function(err) {
          if (err) {
            return callback(err);
          }
          req.bestPageCache[snippet.type] = viewable;
          go();
        });
      } else {
        go();
      }
    });

    function go() {
      var viewable = req.bestPageCache[snippet.type];
      var tags = snippet.tags || [];
      var bestScore;
      var best = null;
      _.each(viewable, function(page) {
        var score = 0;
        var pageTags = (page.typeSettings && page.typeSettings.tags) ? page.typeSettings.tags : [];
        if (!pageTags.length) {
          score = 1;
        }
        var intersect = _.intersection(tags, pageTags);
        var diff = _.difference(tags, pageTags);
        score += intersect.length * 2 - diff.length;
        if ((!best) || (score > bestScore)) {
          bestScore = score;
          best = page;
        }
      });
      return callback(null, best);
    }
  };

  // Returns a "permalink" URL to the snippet, beginning with the
  // slug of the specified page. See findBestPage for a good way to
  // choose a page beneath which to link this snippet.
  //
  // It is commonplace to override this function. For instance,
  // blog posts add the publication date to the URL.

  self.permalink = function(snippet, page) {
    return page.slug + '/' + snippet.slug;
  }

  // Make sure that aposScripts and aposStylesheets summon our
  // browser-side UI assets for managing snippets

  self.pushAsset('script', 'main');

  self.pushAsset('stylesheet', 'main');
  self.pushAsset('template', 'new');
  self.pushAsset('template', 'edit');
  self.pushAsset('template', 'manage');
  self.pushAsset('template', 'import');

  // It's possible to show a collection of recent snippets publicly
  // on a page, and also to access permalink pages for snippets.
  // We might use this directly, but we'll definitely use it in most
  // modules that inherit from this one such as blog and events, which
  // is why it is valuable for it to be supported here.

  // Custom page settings template for snippet collection pages
  self.pushAsset('template', 'pageSettings');

  // Register the snippet-reuse widget unless we've been told not to
  _.defaults(options, { widget: true });
  if (options.widget) {
    self.pushAsset('script', 'widget');
  }

  var browserOptions = options.browser || {};

  // The option can't be .constructor because that has a special meaning
  // in a javascript object (not the one you'd expect, either) http://stackoverflow.com/questions/4012998/what-it-the-significance-of-the-javascript-constructor-property
  var browser = {
    pages: browserOptions.pages || 'aposPages',
    construct: browserOptions.construct || getManagerName(self._instance)
  };
  self._apos.pushGlobalCall('@.replaceType(?, new @())', browser.pages, self.name, browser.construct);

  if (options.widget) {
    widget({ apos: self._apos, app: self._app, snippets: self, name: self.name, label: self.label });
    self._apos.pushGlobalCall('@.addWidgetType()', browser.construct);
  }

  function getManagerName() {
    return 'Apos' + self._instance.charAt(0).toUpperCase() + self._instance.substr(1) + 's';
  }

  if (callback) {
    // Invoke callback on next tick so that the constructor's return
    // value can be assigned to a variable in the same closure where
    // the callback resides
    process.nextTick(function() { return callback(null); });
  }
};

snippets.widget = widget;

