var async = require('async');
var _ = require('underscore');
var extend = require('extend');
var fs = require('fs');

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
// `beforeInsert` receives the req object and a snippet about to be inserted for the
// first time, and a callback. Modify it to add additional fields, then invoke the
// callback with a fatal error if any. (Always sanitize rather than failing
// if it is in any way possible.)
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
  self._webAssetDir = options.webAssetDir || __dirname + '/public';
  // The type property of the page object used to store the snippet, also
  // passed to views for use in CSS classes etc. Should be camel case
  self._instance = options.instance || 'snippet';
  // Hyphenated, all lowercase version of same, for CSS classes, permission names, URLs
  self._css = self._apos.cssName(self._instance);
  self._menuName = options.menuName;

  if (!self._menuName) {
    self._menuName = 'apos' + self._apos.capitalizeFirst(self._instance) + 'Menu';
  }

  self._action = '/apos-' + self._css;

  self.pushAsset = function(type, name) {
    if (type === 'template') {
      // Render templates in our own nunjucks context
      self._apos.pushAsset('template', self.renderer(name));
    } else {
      return self._apos.pushAsset(type, name, self._dirs, self._action);
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
      if (self.beforeInsert) {
        return self.beforeInsert(req, snippet, callback);
      }
      return callback(null);
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

  self._app.post(self._action + '/update', function(req, res) {
    var snippet;
    var title;
    var content;
    var originalSlug;
    var slug;
    var tags;

    title = req.body.title.trim();
    // Validation is annoying, automatic cleanup is awesome
    if (!title.length) {
      title = self.getDefaultTitle();
    }

    tags = req.body.tags;

    originalSlug = req.body.originalSlug;
    slug = self._apos.slugify(req.body.slug);
    if (!slug.length) {
      slug = originalSlug;
    }

    content = JSON.parse(req.body.content);
    self._apos.sanitizeItems(content);

    async.series([ getSnippet, permissions, massage, update, redirect ], send);

    function getSnippet(callback) {
      self._apos.getPage(originalSlug, function(err, page) {
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
      return self._apos.permissions(req, 'edit-' + self._instance, post, function(err) {
        // If there is no permissions error then we are cool
        // enough to create a post
        return callback(err);
      });
    }

    function massage(callback) {
      post.title = title;
      post.slug = slug;
      post.tags = tags;
      post.areas = { body: { items: content } };
      if (self.beforeUpdate) {
        return self.beforeUpdate(req, post, callback);
      }
      return callback(null);
    }

    function update(callback) {
      self._apos.putPage(originalSlug, post, callback);
    }

    function redirect(callback) {
      self._apos.updateRedirect(originalSlug, slug, callback);
    }

    function send(err) {
      if (err) {
        res.statusCode = 500;
        return res.send('error');
      }
      return res.send(JSON.stringify(post));
    }
  });

  self._app.post(self._action + '/delete', function(req, res) {

    async.series([ get, permissions, beforeDelete, deleteSnippet], respond);

    var slug;
    var snippet;

    function get(callback) {
      slug = req.body.slug;
      return self._apos.getPage(slug, function(err, postArg) {
        snippet = postArg;
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

  // Serve our assets. This is the final route so it doesn't
  // beat out the rest. Note we allow overrides for assets too
  self._app.get(self._action + '/*', self._apos.static(self._webAssetDir));

  self._apos.addLocal(self._menuName, function(args) {
    var result = self.render('menu', args);
    return result;
  });

  // Render a partial, looking for overrides in our preferred places
  self.render = function(name, data) {
    return self.renderer(name)(data);
  };

  // Return a function that will render a particular partial looking for overrides in our
  // preferred places
  self.renderer = function(name) {
    return function(data) {
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

  self.get = function(req, optionsArg, callback) {
    if (!callback) {
      callback = optionsArg;
      optionsArg = {};
    }
    var options = {};
    extend(options, optionsArg, true);
    // Consume options then remove them, turning the rest into mongo criteria
    var editable = options.editable;
    if (options.editable !== undefined) {
      delete options['editable'];
    }
    var sort = options.sort || { sortTitle: 1};
    if (options.sort !== undefined) {
      delete options['sort'];
    }
    options.type = self._instance;
    // TODO: with many snippets there is a performance problem with calling
    // permissions separately on them. Pagination will have to be performed
    // manually after all permissions have been checked. The A1.5 permissions
    // model wasn't perfect but it was fully integrated with the database.
    self._apos.pages.find(options).sort(sort).toArray(function(err, snippets) {
      if (err) {
        return callback(err);
      }
      async.filter(snippets, function(snippet, callback) {
        self._apos.permissions(req, editable ? 'edit-' + self._css : 'view-' + self._css, snippet, function(err) {
          return callback(!err);
        });
      }, function(snippets) {
        return callback(null, snippets);
      });
    });
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
        console.log('added permission for ' + permissionName + ' set to ' + (!err));
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

  // Often overridden when subclassing
  self.dispatch = function(req, callback) {
    var permalink = false;
    if (req.remainder.length) {
      // Perhaps it's a snippet permalink
      req.query.slug = req.remainder;
      permalink = true;
    }

    var criteria = {};
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


  // Make sure that aposScripts and aposStylesheets summon our
  // browser-side UI assets for managing snippets

  self.pushAsset('script', 'main');
  self.pushAsset('stylesheet', 'main');
  self.pushAsset('template', 'new');
  self.pushAsset('template', 'edit');
  self.pushAsset('template', 'manage');

  // It's possible to show a collection of recent snippets publicly
  // on a page, and also to access permalink pages for snippets.
  // We might use this directly, but we'll definitely use it in most
  // modules that inherit from this one such as blog and events, which
  // is why it is valuable for it to be supported here.

  // Custom page settings template for snippet collection pages
  self.pushAsset('template', 'pageSettings');

  if (callback) {
    // Invoke callback on next tick so that the constructor's return
    // value can be assigned to a variable in the same closure where
    // the callback resides
    process.nextTick(function() { return callback(null); });
  }
};


