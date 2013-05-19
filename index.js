var async = require('async');
var _ = require('underscore');
var extend = require('extend');
var fs = require('fs');
var widget = require(__dirname + '/widget.js');
var async = require('async');
var csv = require('csv');
var moment = require('moment');

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

  // "Protected" properties. We want modules like the blog to be able
  // to access these, thus no variables defined in the closure
  self._apos = options.apos;
  self._pages = options.pages;
  self._app = options.app;
  self._searchable = options.searchable || true;
  self._options = options;
  self._perPage = options.perPage || 10;

  // self.modules allows us to find the directory path and web asset path to
  // each module in the inheritance tree when subclassing. Necessary to push all
  // relevant assets to the browser and to implement template overrides.
  //
  // The final subclass appears at the start of the list, which is right for a
  // chain of template overrides
  self._modules = (options.modules || []).concat([ { dir: __dirname, name: 'snippets' } ]);

  // Compute the web directory name for use in asset paths
  _.each(self._modules, function(module) {
    module.web = '/apos-' + self._apos.cssName(module.name);
  });

  // The same list in reverse order, for use in pushing assets (all versions of the
  // asset file are pushed to the browser, starting with the snippets class, because
  // CSS and JS are cumulative and CSS is very order dependent)
  //
  // Use slice(0) to make sure we get a copy and don't alter the original
  self._reverseModules = self._modules.slice(0).reverse();

  // These are "public" so the object can be passed directly to pages.addType
  self.name = options.name || 'snippets';
  self.label = options.label || 'Snippets';
  // Used just for the widget right now, could be handy elsewhere
  self.icon = options.icon || 'snippets';

  // The type property of the page object used to store the snippet, also
  // passed to views for use in CSS classes etc. Should be camel case. These
  // page objects will not have slugs beginning with /
  self._instance = options.instance || 'snippet';
  // Hyphenated, all lowercase version of same, for CSS classes, permission names, URLs
  self._css = self._apos.cssName(self._instance);
  // We need a CSS name for the page type too; it's not the same thing,
  // there can be multiple page types that share an instance type but have
  // their own page settings
  self._typeCss = self._apos.cssName(self.name);
  self._menuName = options.menuName;
  // All partials generated via self.renderer can see these properties
  self._rendererGlobals = options.rendererGlobals || {};

  self._action = '/apos-' + self._typeCss;

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
      return self._apos.partial(name, data, _.map(self._modules, function(module) { return module.dir + '/views'; }));
    };
  };

  self.pushAsset = function(type, name) {
    if (type === 'template') {
      // Render templates in our own nunjucks context
      self._apos.pushAsset('template', self.renderer(name));
    } else {
      // We're interested in ALL versions of main.js or main.css, starting
      // with the base one (snippets module version)

      _.each(self._reverseModules, function(module) {
        return self._apos.pushAsset(type, name, module.dir, module.web);
      });
    }
  };

  // Only one page type with a given instance type will be the manager for
  // that instance type. The manager is the page type that also provides
  // a dropdown menu for actually creating and managing snippets. Other
  // page types with the same snippet type are just alternate ways of
  // presenting snippets in the context of a page, like an alternate
  // treatment for blogs for instance.
  self.manager = false;

  if (!typesByInstanceType[self._instance]) {
    typesByInstanceType[self._instance] = [];
    self.manager = true;
  }
  typesByInstanceType[self._instance].push(self);

  // MANAGER FUNCTIONALITY: creating and managing snippets

  if (self.manager) {
    if (!self._menuName) {
      self._menuName = 'apos' + self._apos.capitalizeFirst(self._instance) + 'Menu';
    }

    self.getDefaultTitle = function() {
      return 'My Snippet';
    };

    self.beforeInsert = function(req, data, snippet, callback) {
      return callback(null);
    };

    self.beforeUpdate = function(req, data, snippet, callback) {
      return callback(null);
    };

    // Fields to be imported or read from the browser when saving a new item.
    // You can read properties directly or leverage this mechanism to handle the types
    // that it supports painlessly. It's not meant to cover everything, just tricky
    // field types that would otherwise be very challenging to implement, such as areas.
    // (In fact, right now it only covers areas!)

    self.convertFields = [
      {
        // This one will always import as an empty area for now when importing CSV.
        // TODO: allow URLs in CSV to be imported.
        name: 'thumbnail',
        type: 'area'
      },
      {
        name: 'body',
        type: 'area'
      }
    ];

    // Very handy for imports of all kinds: convert plaintext to an area with
    // one rich text item if it is not blank, otherwise an empty area. null and
    // undefined are tolerated and converted to empty areas.
    self.textToArea = function(text) {
      var area = { items: [] };
      if ((typeof(text) === 'string') && text.length) {
        area.items.push({
          type: 'richText',
          content: self._apos.escapeHtml(text)
        });
      }
      return area;
    };

    // Converters from various formats for various types
    self.converters = {
      csv: {
        area: function(data, name, snippet) {
          if (!snippet.areas) {
            snippet.areas = {};
          }
          snippet.areas[name] = self.textToArea(data[name]);
        }
      },
      form: {
        area: function(data, name, snippet) {
          var content = [];
          try {
            content = JSON.parse(data[name]);
          } catch (e) {
            // Always recover graciously and import something reasonable, like an empty area
          }
          self._apos.sanitizeItems(content);
          if (!snippet.areas) {
            snippet.areas = {};
          }
          snippet.areas[name] = { items: content };
        }
      }
    };

    self.convertAllFields = function(from, data, snippet) {
      _.each(self.convertFields, function(field) {
        self.converters[from][field.type](data, field.name, snippet);
      });
    };

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
        var published = self._apos.sanitizeBoolean(data.published, true);

        var snippet = {
          type: self._instance,
          areas: {},
          title: data.title || self.getDefaultTitle(),
          tags: tags,
          published: published
        };

        self.convertAllFields('csv', data, snippet);

        snippet.slug = self._apos.slugify(snippet.title);
        snippet.sortTitle = self._apos.sortify(snippet.title);
        // Record when the import happened so that later we can offer a UI
        // to find these groups and remove them if desired
        snippet.imported = req.aposImported;
        self.beforeInsert(req, data, snippet, function(err) {
          if (err) {
            return callback(err);
          }
          return self.importSaveItem(req, snippet, callback);
        });
      } catch (e) {
        console.log(e);
        throw e;
      }
    };

    self.importSaveItem = function(req, snippet, callback) {
      self._apos.putPage(req, snippet.slug, snippet, callback);
    };

    self.addStandardRoutes = function() {
      // TODO: refactor lots of duplication in /insert and /update

      self._app.post(self._action + '/insert', function(req, res) {
        var snippet;
        var title;
        var thumbnail;
        var content;
        var slug;
        var published = self._apos.sanitizeBoolean(req.body.published, true);

        title = req.body.title.trim();
        // Validation is annoying, automatic cleanup is awesome
        if (!title.length) {
          title = self.getDefaultTitle();
        }
        slug = self._apos.slugify(title);

        tags = req.body.tags;

        snippet = { title: title, published: published, type: self._instance, tags: tags, areas: {}, slug: slug, createdAt: new Date(), publishedAt: new Date() };
        snippet.sortTitle = self._apos.sortify(snippet.title);

        self.convertAllFields('form', req.body, snippet);

        tags = req.body.tags;

        async.series([ prepare, insert ], send);

        function prepare(callback) {
          return self.beforeInsert(req, req.body, snippet, callback);
        }

        function insert(callback) {
          return self._apos.putPage(req, slug, snippet, callback);
        }

        function send(err) {
          if (err) {
            res.statusCode = 500;
            return res.send('error');
          }
          return res.send(JSON.stringify(snippet));
        }
      });


      self._app.post(self._action + '/update', function(req, res) {
        var snippet;
        var title;
        var content;
        var originalSlug;
        var slug;
        var tags;
        var published = self._apos.sanitizeBoolean(req.body.published, true);

        title = self._apos.sanitizeString(req.body.title, self.getDefaultTitle());

        tags = req.body.tags;

        originalSlug = self._apos.sanitizeString(req.body.originalSlug);
        slug = self._apos.slugify(req.body.slug);
        if (!slug.length) {
          slug = originalSlug;
        }

        async.series([ getSnippet, massage, update, redirect ], send);

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

        function massage(callback) {
          snippet.areas = {};
          self.convertAllFields('form', req.body, snippet);
          snippet.title = title;
          snippet.slug = slug;
          snippet.tags = tags;
          snippet.sortTitle = self._apos.sortify(title);
          snippet.published = published;
          return self.beforeUpdate(req, req.body, snippet, callback);
        }

        function update(callback) {
          self._apos.putPage(req, originalSlug, snippet, callback);
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

      self._app.post(self._action + '/trash', function(req, res) {
        async.series([ get, permissions, beforeTrash, trashSnippet], respond);

        var slug;
        var snippet;
        var trash = self._apos.sanitizeBoolean(req.body.trash);

        function get(callback) {
          slug = req.body.slug;
          return self._apos.pages.findOne({ slug: slug }, function(err, snippetArg) {
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
          return self._apos.permissions(req, 'edit-page', snippet, function(err) {
            // If there is no permissions error then we are cool
            // enough to trash the post
            return callback(err);
          });
        }

        function beforeTrash(callback) {
          if (self.beforeTrash) {
            return self.beforeTrash(req, snippet, trash, callback);
          }
          return callback(null);
        }

        function trashSnippet(callback) {
          var action;
          if (trash) {
            action = { $set: { trash: true } };
          } else {
            action = { $unset: { trash: true } };
          }
          self._apos.pages.update({slug: snippet.slug}, action, callback);
        }

        function respond(err) {
          if (err) {
            res.statusCode = 404;
            return res.send(err);
          }
          res.statusCode = 200;
          return res.send('ok');
        }
      });

      self._app.post(self._action + '/import', function(req, res) {
        var file = req.files.file;
        var rows = 0;
        var headings = [];
        var s = csv().from.stream(fs.createReadStream(file.path));
        var active = 0;
        var date = new Date();
        req.aposImported = moment().format();
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
                active--;
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
          // Ignore blank rows without an error
          if (!_.some(row, function(column) { return column !== ''; })) {
            return callback(null);
          }
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

      self._app.get(self._action + '/get', function(req, res) {
        var options = {};
        self.addApiCriteria(req.query, options);
        self.get(req, options, function(err, results) {
          if (err) {
            res.statusCode = 500;
            return res.send('error');
          }
          return res.send(JSON.stringify(results.snippets));
        });
      });

      self._app.get(self._action + '/get-one', function(req, res) {
        var options = {};
        self.addApiCriteria(req.query, options);
        self.get(req, options, function(err, results) {
          if (results && results.snippets.length) {
            res.send(JSON.stringify(results.snippets[0]));
          } else {
            res.send(JSON.stringify(null));
          }
        });
      });

      // A good extension point for adding criteria specifically for the /get and
      // get-one API calls used when managing content
      self.addApiCriteria = function(query, criteria) {
        extend(true, criteria, query);
        criteria.editable = true;
      };

      // Extension point. The blog module uses this to add
      // publishedAt = 'any'
      self.addExtraAutocompleteCriteria = function(req, criteria) {
      };

      self._app.get(self._action + '/autocomplete', function(req, res) {
        var options = {
          fields: self.getAutocompleteFields(),
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
        self.addExtraAutocompleteCriteria(req, options);
        // Format it as value & id properties for compatibility with jquery UI autocomplete
        self.get(req, options, function(err, results) {
          if (err) {
            res.statusCode = 500;
            return res.send('error');
          }
          var snippets = results.snippets;
          // Put the snippets in id order
          if (req.query.ids) {
            snippets = self._apos.orderById(req.query.ids, snippets);
          }
          return res.send(
            JSON.stringify(_.map(snippets, function(snippet) {
                return { value: self.getAutocompleteTitle(snippet), id: snippet._id };
            }))
          );
        });
      });
    };

    // Override me in subclasses in which duplicate titles are common and there
    // is a way to disambiguate them, like publication dates for blogs or start
    // dates for events
    self.getAutocompleteTitle = function(snippet) {
      return snippet.title;
    };

    // I bet you want some extra fields available along with the title to go with
    // your custom getAutocompleteTitle. Override this to retrieve more stuff.
    // We keep it to a minimum for performance.
    self.getAutocompleteFields = function() {
      return { title: 1, _id: 1 };
    };

    self.addStandardRoutes();

    // Extra routes added at project level or in a module that extends this module
    if (options.addRoutes) {
      options.addRoutes();
    }

    // SEARCH AND VERSIONING SUPPORT

    // The default properties for snippets are already covered by the
    // default properties for pages in general. Extend this to add more
    // lines of diff-friendly text representing metadata relating to
    // this type of snippet. Always call the superclass version
    self.addDiffLines = function(snippet, lines) {
    };

    // The default properties for snippets are already covered by the
    // default properties for pages in general. Extend this to add more
    // search texts representing metadata relating to
    // this type of snippet. Always call the superclass version. Example:
    // texts.push({ weight: 20, text: snippet.address })
    //
    // The default search engine is very simplistic. Searches that match
    // something weighted 11 or higher appear before everything else.

    self.addSearchTexts = function(snippet, texts) {
    };

    // Add a listener so we can contribute our own metadata to the set of lines used
    // for the diffs between versions. Pass an inline function so that self.addDiffLines
    // can be changed by a subclass of snippets (if we just assign it now, it'll be
    // the default version above no matter what).

    self._apos.addListener('diff', function(snippet, lines) {
      if (snippet.type === self._instance) {
        self.addDiffLines(snippet, lines);
      }
    });

    self._apos.addListener('index', function(snippet, lines) {
      if (snippet.type === self._instance) {
        self.addSearchTexts(snippet, lines);
      }
    });

    self._apos.addListener('searchResult', function(req, res, page, context) {
      // Not all types are searchable on all sites, snippets usually
      // have this shut off because they have no permalinks
      if (!self._searchable) {
        return;
      }
      // Don't mess with a result another listener already accepted
      if (context.accepted) {
        return;
      }
      if (self._instance === page.type) {
        // Set the accepted flag so the pages module doesn't 404 the search result.
        // Now we can asynchronously work on it
        context.accepted = true;
        // The result belongs to us now, let's figure out what to do with it.
        return self.findBestPage(req, page, function(err, bestPage) {
          if (!bestPage) {
            res.statusCode = 404;
            return res.send('Not Found');
          }
          var url = self.permalink(page, bestPage);
          return res.redirect(url);
        });
      }
    });

    self._apos.addLocal(self._menuName, function(args) {
      var result = self.render('menu', args);
      return result;
    });

    // Make sure that aposScripts and aposStylesheets summon our
    // browser-side UI assets for managing snippets

    self.pushAsset('template', 'new');
    self.pushAsset('template', 'edit');
    self.pushAsset('template', 'manage');
    self.pushAsset('template', 'import');
  }

  // We still need a browser side js file even if we're not the manager,
  // and we may as well be allowed a stylesheet
  self.pushAsset('script', 'main');
  self.pushAsset('stylesheet', 'main');

  // END OF MANAGER FUNCTIONALITY

  // Serve our assets. This is the final route so it doesn't
  // beat out the rest. (TODO: consider moving all asset routes so that this
  // is not an issue anymore.)
  //
  // You don't override js and stylesheet assets, rather you serve more of them
  // from your own module and enhance what's already in browserland.
  //
  // TODO: this will be redundant, although harmlessly so, if there are
  // several snippet-derived modules active in the project

  _.each(self._modules, function(module) {
    self._app.get(module.web + '/*', self._apos.static(module.dir + '/public'));
  });

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
  //
  // FETCHING METADATA FOR FILTERS
  //
  // If options.fetch is present, snippets.get will deliver an object
  // with a `snippets` property containing the array of snippets, rather
  // than delivering the array of snippets directly.
  //
  // If options.fetch.tags is true, snippets.get will also deliver a
  // `tags` property, containing all tags that are present on the snippets
  // (ignoring limit and skip). This is useful to present a "filter by tag"
  // interface.
  //
  // LIMITING METADATA RESULTS
  //
  // When you pass options.fetch.tags = true, the .tags property returned
  // is NOT restricted by any `tags` criteria present in `optionsArg`, so
  // that you may present alternatives to the tag you are currently filtering by.
  //
  // However, you may still need to restrict the tags somewhat, for instance because
  // the entire page is locked down to show only things tagged red, green or blue.
  // You could do this after the fact but that would require MongoDB to do more
  // work up front. So for efficiency's sake, you can supply an object as the value
  // of options.fetch.tags, with an `only` property restricting the possible results:
  //
  // options.fetch.tags = { only: [ 'red', 'green', 'blue' ] }
  //
  // Conversely, you may need to ensure a particular tag *does* appear in results.tags,
  // usually because it is the tag the user is manually filtering by right now:
  //
  // Include 'blue' in the result even if it matches no snippets
  //
  // options.fetch.tags { only: [ 'red', 'green', 'blue' ], always: 'blue' }

  self.get = function(req, optionsArg, callback) {

    var options = {};
    extend(true, options, optionsArg);
    // For snippets the default sort is alpha
    if (!options.sort) {
      options.sort = { sortTitle: 1 };
    }
    if (!options.type) {
      options.type = self._instance;
    }
    var fetch = options.fetch;
    delete options.fetch;

    return self._apos.get(req, options, function(err, results) {
      if (err) {
        return callback(err);
      }
      results.snippets = results.pages;
      delete results.pages;
      if (fetch) {
        return self.fetchMetadataForFilters(fetch, results.criteria, results, callback);
      } else {
        return callback(null, results);
      }
    });
  };

  // Add additional metadata like available tags to `results`. You should take advantage
  // of the mongodb criteria in `criteria` to display only the choices that will
  // return results. For instance, for tags, we fetch only tags that appear on
  // at least one snippet that meets the other criteria that are currently active.
  // This lets us avoid displaying filters that point to empty pages.
  //
  // You should retrieve options for a given filter only if `fetch.yourfiltername` is set
  // (as seen below for `fetch.tags`). If `fetch.only` is set you must respect that
  // limitation on the allowed values. If `fetch.always` is set you must always include
  // that particular value in your results even if it matches no snippets.
  //
  // If `criteria` is already filtered by the property you are interested in, you should
  // remove that property from `criteria` before querying. However you MUST restore
  // that property to criteria` before calling the superclass version of this method.
  // If you're nervous, copy `criteria` with extend(true, myCriteria, criteria).
  //
  // See the `fetchTags` function within this method for a well-executed example.

  self.fetchMetadataForFilters = function(fetch, criteria, results, callback) {
    // Written to accommodate fetching other filters' options easily
    async.series([fetchTags], function(err) {
      if (err) {
        return callback(err);
      }
      return callback(null, results);
    });

    function fetchTags(callback) {
      if (!fetch.tags) {
        return callback(null);
      }
      // Always save criteria we modify and restore them later
      var saveTagCriteria = criteria.tags;
      delete criteria.tags;
      if (typeof(fetch.tags) === 'object') {
        if (fetch.tags.only) {
          criteria.tags = fetch.tags.only;
        }
      }
      self._apos.pages.distinct("tags", criteria, function(err, tags) {
        if (err) {
          return callback(err);
        }
        // Always restore any criteria we modified
        criteria.tags = saveTagCriteria;
        results.tags = tags;
        if (fetch.tags.always) {
          if (!_.contains(results.tags, fetch.tags.always)) {
            results.tags.push(fetch.tags.always);
          }
        }
        // alpha sort
        results.tags.sort();
        return callback(null);
      });
    }
  };

  // This is a loader function, for use with the `load` option of
  // the pages module's `serve` method.
  //
  // If the page type group is not "snippet" (or as overridden via self._instance),
  // this loader does nothing.
  //
  // Otherwise, if the page matches the URL
  // exactly, self function serves up the "main index" page of the snippet
  // repository (a list of snippets in alphabetical in blog order).
  //
  // If the page is an inexact match, self function looks at the remainder of the
  // URL to decide what to do. If the remainder is a slug, the snippet with that
  // slug is served (a "permalink page").
  //
  // "Why would you want to give snippets permalinks?" You typically wouldn't. But in
  // a module that inherits from snippets, like the blog module, this is the starting
  // point for serving up blogs (index pages) and permalink pages.

  self.loader = function(req, callback) {
    async.series([go, permissions], callback);

    function go(callback) {
      if (!req.bestPage) {
        return callback(null);
      }

      // If the page type doesn't share our type name
      // this page isn't relevant for us
      if (req.bestPage.type !== self.name) {
        return callback(null);
      }

      // We consider a partial match to be good enough, depending on the
      // remainder of the URL
      req.page = req.bestPage;

      self.dispatch(req, callback);
    }

    function permissions(callback) {
      // Does this person have any business editing snippets? If so make that
      // fact available to templates so they can offer buttons to access
      // the admin interface conveniently
      self._apos.permissions(req, 'edit-' + self._css, null, function(err) {
        var permissionName = 'edit' + self._apos.capitalizeFirst(self._instance);
        req.extras[permissionName] = !err;
        return callback(null);
      });
    }
  };

  // Decide what to do based on the remainder of the URL. The default behavior
  // is to display an index of snippets if there is nothing further in the URL
  // after the page itself, and to look for a snippets with a slug matching the
  // rest of the URL if there is.
  //
  // It's not uncommon to override this completely, but before you do that, look at
  // the isShow, show, index and addCriteria methods to see if overriding them is enough
  // for your needs.

  self.dispatch = function(req, callback) {
    var permalink = false;
    var criteria = {};
    var show = false;
    var slug = self.isShow(req);
    if (slug !== false) {
      show = true;
      criteria.slug = slug;
    } else {
      self.addPager(req, criteria);
    }
    self.addCriteria(req, criteria);
    // If we are requesting a specific slug, remove the tags criterion.
    // In theory we should be strict about this, but in practice this is
    // sometimes necessary to make sure permalink pages are available when
    // users have not created any really appropriate snippet page. TODO:
    // consider whether to go back to being strict, after we resolve
    // any concerns with DR.
    if (slug) {
      criteria.tags = undefined;
    }
    return self.get(req, criteria, function(err, results) {
      if (err) {
        return callback(err);
      }

      // Make the filter metadata (like tag lists) available to the template
      req.extras.filters = _.omit(results, 'snippets');

      if (show) {
        if (!results.snippets.length) {
          // Correct way to request a 404 from a loader.
          // Other loaders could still override this, which is good
          req.notfound = true;
          return callback(null);
        } else {
          return self.show(req, results.snippets[0], callback);
        }
      } else {
        self.setPagerTotal(req, results.total);
        return self.index(req, results.snippets, callback);
      }
      return callback(null);
    });
  };

  // Sets up req.extras.pager and adds skip and limit to the criteria.
  // YOU MUST ALSO CALL setPagerTotal after the total number of items available
  // is known (results.total in the get callback).

  self.addPager = function(req, criteria) {
    var pageNumber = self._apos.sanitizeInteger(req.query.page, 1, 1);
    req.extras.pager = {
      page: pageNumber
    };
    criteria.skip = self._perPage * (pageNumber - 1);
    criteria.limit = self._perPage;
  };

  self.setPagerTotal = function(req, total) {
    req.extras.pager.total = Math.ceil(total / self._perPage);
    if (req.extras.pager.total < 1) {
      req.extras.pager.total = 1;
    }
  };

  // If this request looks like a request for a 'show' page (a permalink),
  // this method returns the expected snippet slug. Otherwise it returns
  // false. Override this to match URLs with extra vanity components like
  // the publication date in an article URL.
  self.isShow = function(req) {
    if (req.remainder.length) {
      // Perhaps it's a snippet permalink
      return req.remainder.substr(1);
    }
    return false;
  };

  // The standard implementation of a 'show' page for a single snippet, for your
  // overriding convenience
  self.show = function(req, snippet, callback) {
    req.template = self.renderer('show');
    // Generic noun so we can more easily inherit templates
    req.extras.item = snippet;
    req.extras.item.url = self.permalink(req.extras.item, req.bestPage);
    return callback(null);
  };

  // The standard implementation of an 'index' page for many snippets, for your
  // overriding convenience
  self.index = function(req, snippets, callback) {
    req.template = self.renderer('index');
    _.each(snippets, function(snippet) {
      snippet.url = self.permalink(snippet, req.bestPage);
    });
    // Generic noun so we can more easily inherit templates
    req.extras.items = snippets;
    return callback(null);
  };

  self.addCriteria = function(req, criteria) {
    criteria.fetch = {
      tags: {}
    };
    if (req.page.typeSettings && req.page.typeSettings.tags && req.page.typeSettings.tags.length) {
      criteria.tags = { $in: req.page.typeSettings.tags };
      // This restriction also applies when fetching distinct tags
      criteria.fetch.tags = { only: req.page.typeSettings.tags };
    }
    if (req.query.tag) {
      // Override the criteria for fetching snippets but leave criteria.fetch.tags
      // alone
      criteria.tags = { $in: [ req.query.tag ] };
      // Always return the active tag as one of the filter choices even if
      // there are no results in this situation. Otherwise the user may not be
      // able to see the state of the filter (for instance if it is expressed
      // as a select element)
      criteria.fetch.tags.always = req.query.tag;
    }
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
  // req.aposBestPageCache for the lifetime of the request so that many calls for many
  // snippets do not result in an explosion of database activity on behalf of a
  // single request.
  //
  // The scoring algorithm was ported directly from Apostrophe 1.5's aEngineTools class.

  self.findBestPage = function(req, snippet, callback) {
    if (req.aposBestPageCache && req.aposBestPageCache[snippet.type]) {
      return go();
    }
    var typeNames = _.map(typesByInstanceType[snippet.type] || [], function(type) { return type.name; });
    // Pages in the trash are never good permalinks
    var pages = self._apos.pages.find({ trash: { $exists: false }, type: { $in: typeNames }, slug: /^\// }).toArray(function(err, pages) {
      if (err) {
        console.log('error is:');
        console.log(err);
        return callback(err);
      }
      if (!req.aposBestPageCache) {
        req.aposBestPageCache = {};
      }
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
        req.aposBestPageCache[snippet.type] = viewable;
        go();
      });
    });

    function go() {
      var viewable = req.aposBestPageCache[snippet.type];
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
  //
  // TODO: this exposes that we're not really letting people change
  // the root of the site from / yet. We need to make that a global
  // option to the pages module and not just an option to pages.serve,
  // or perhaps stuff it into req if we're really going to support
  // multiple "sites" per domain etc.

  self.permalink = function(snippet, page) {
    return page.slug + '/' + snippet.slug;
  };

  // Add the .url property to snippets so they can be clicked through
  self.addUrls = function(req, snippets, callback) {
    async.eachSeries(snippets, function(snippet, callback) {
      self.findBestPage(req, snippet, function(err, page) {
        if (page) {
          snippet.url = self.permalink(snippet, page);
        }
        return callback(null);
      });
    }, callback);
  };

  // CUSTOM PAGE SETTINGS TEMPLATE
  self.pushAsset('template', 'pageSettings');

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

  // WIDGET SETUP, ALSO BROWSER-SIDE SETUP FOR THE PAGE TYPE

  // It's possible to show a collection of recent snippets publicly
  // on a page, and also to access permalink pages for snippets.
  // We might use this directly, but we'll definitely use it in most
  // modules that inherit from this one such as blog and events, which
  // is why it is valuable for it to be supported here.

  // Register the snippet-reuse widget unless we've been told not to
  _.defaults(options, { widget: true });

  var browserOptions = options.browser || {};

  // The option can't be .constructor because that has a special meaning
  // in a javascript object (not the one you'd expect, either) http://stackoverflow.com/questions/4012998/what-it-the-significance-of-the-javascript-constructor-property
  var browser = {
    pages: browserOptions.pages || 'aposPages',
    construct: browserOptions.construct || getBrowserConstructor()
  };
  self._pages.addType(self);
  self._apos.pushGlobalCall('@.replaceType(?, new @(?))', browser.pages, self.name, browser.construct, { name: self.name, instance: self._instance, icon: self._icon, css: self._css, typeCss: self._typeCss, manager: self.manager, action: self._action });

  if (options.widget) {
    var widgetConstructor;
    // Let subclasses and customized projects override the widget constructor.
    // If it's truthy but not a function, supply the standard constructor.
    if (typeof(options.widget) === 'function') {
      widgetConstructor = options.widget;
    } else {
      widgetConstructor = snippets.widget.Widget;
    }
    new widgetConstructor({ apos: self._apos, icon: self.icon, app: self._app, snippets: self, name: self.name, label: self.label });
    self._apos.pushGlobalCall('@.addWidgetType()', browser.construct);
  }

  function getBrowserConstructor() {
    return 'Apos' + self.name.charAt(0).toUpperCase() + self.name.substr(1);
  }

  if (callback) {
    // Invoke callback on next tick so that the constructor's return
    // value can be assigned to a variable in the same closure where
    // the callback resides
    process.nextTick(function() { return callback(null); });
  }
};

snippets.widget = widget;
