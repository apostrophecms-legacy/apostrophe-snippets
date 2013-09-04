var async = require('async');
var _ = require('underscore');
var extend = require('extend');
var fs = require('fs');
var widget = require(__dirname + '/widget.js');
var async = require('async');
var csv = require('csv');
var moment = require('moment');

module.exports = snippets;

// A mapping of all page type objects by instance type, for use in locating
// page types that are compatible with various instance types. For instance,
// if three variations on a blog are registered, all with the instance
// option set to blogPost, then typesByInstanceType.blogPost will be an array
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

  // Our chance to veto our snippets for display to the public as search results
  self._apos.on('searchable', function(info) {
    if (self._instance === info.page.type) {
      if (!self._searchable) {
        info.suitable = false;
      }
    }
  });

  extend(true, self._rendererGlobals, {
    type: _.pick(self, [ 'name', 'label', 'icon', '_instance', '_css', '_typeCss', '_menuName', '_action' ])
  });

  self.setBridge = function(modules) {
    self._bridge = modules;
  };

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

  self.pushAsset = function(type, name, optionsArg) {
    var options = {};
    if (optionsArg) {
      extend(true, options, optionsArg);
    }
    if (type === 'template') {
      // Render templates in our own nunjucks context
      self._apos.pushAsset('template', self.renderer(name), options);
    } else {
      // We're interested in ALL versions of main.js or main.css, starting
      // with the base one (snippets module version)

      _.each(self._reverseModules, function(module) {
        options.fs = module.dir;
        options.web = module.web;
        return self._apos.pushAsset(type, name, options);
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

    self.authorAsEditor = function(req, snippet) {
      if (req.user && (!req.user.permissions.admin)) {
        // Always add the creator as a permitted editor
        // so they retain the ability to manage their work,
        // regardless of other permissions that may exist
        if (!snippet.editPersonIds) {
          snippet.editPersonIds = [];
        }
        snippet.editPersonIds.push(req.user._id);
      }
    };

    self.beforeInsert = function(req, data, snippet, callback) {
      return callback(null);
    };

    self.afterInsert = function(req, data, snippet, callback) {
      return callback(null);
    };

    self.beforeUpdate = function(req, data, snippet, callback) {
      return callback(null);
    };

    self.afterUpdate = function(req, data, snippet, callback) {
      return callback(null);
    };

    self.beforeSave = function(req, data, snippet, callback) {
      return callback(null);
    };

    self.afterSave = function(req, data, snippet, callback) {
      return callback(null);
    };

    // The schema: fields to be imported or read from the browser when saving
    // an item. Also pushed as an option to the browser side manager object
    // so that it can automatically handle these fields.
    //
    // You can read properties directly or leverage this mechanism to handle
    // the types that it supports painlessly. strings, booleans,
    // integers, floats, selects and areas are supported. You can set a 'def'
    // (default) property, which is passed  to sanitizeBoolean, sanitizeString,
    // etc. and also additional type-dependent properties like min and max
    // (for integers) and choices (for selects).

    self.convertFields = [
      {
        // This one will always import as an empty area for now when importing CSV.
        // TODO: allow URLs in CSV to be imported.
        name: 'thumbnail',
        type: 'singleton',
        widgetType: 'slideshow',
        options: {
          limit: 1,
          label: 'Thumbnail'
        }
      },
      {
        name: 'body',
        type: 'area'
        // options: {
        //   slideshow: {
        //     limit: 1
        //   }
        // }
      },
      {
        name: 'hideTitle',
        type: 'boolean',
        def: false
      }
    ];

    // Simple way to add fields to the schema
    if (options.addFields) {
      self.convertFields = self.convertFields.concat(options.addFields);
    }
    // A function that alters the schema
    if (options.alterFields) {
      options.alterFields(self.convertFields);
    }

    // For bc
    self.textToArea = self._apos.textToArea;

    // Converters from various formats for various types. Define them all
    // for the csv importer, then copy that as a starting point for
    // regular forms and override those that are different (areas)
    self.converters = {};
    self.converters.csv = {
      area: function(data, name, snippet, field) {
        if (!snippet.areas) {
          snippet.areas = {};
        }
        snippet.areas[name] = self.textToArea(data[name]);
      },
      string: function(data, name, snippet, field) {
        snippet[name] = self._apos.sanitizeString(data[name], field.def);
      },
      boolean: function(data, name, snippet, field) {
        snippet[name] = self._apos.sanitizeBoolean(data[name], field.def);
      },
      select: function(data, name, snippet, field) {
        snippet[name] = self._apos.sanitizeSelect(data[name], field.choices, field.def);
      },
      integer: function(data, name, snippet, field) {
        snippet[name] = self._apos.sanitizeInteger(data[name], field.def, field.min, field.max);
      },
      float: function(data, name, snippet, field) {
        snippet[name] = self._apos.sanitizeFloat(data[name], field.def, field.min, field.max);
      },
      url: function(data, name, snippet, field) {
        snippet[name] = self._apos.sanitizeUrl(data[name], field.def);
      },
    };
    // As far as the server is concerned a singleton is just an area
    self.converters.csv.singleton = self.converters.csv.area;

    self.converters.form = {};
    extend(self.converters.form, self.converters.csv, true);

    self.converters.form.singleton = self.converters.form.area = function(data, name, snippet) {
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
    };

    self.convertAllFields = function(from, data, snippet) {
      _.each(self.convertFields, function(field) {
        self.converters[from][field.type](data, field.name, snippet, field);
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
        // Record when the import happened so that later we can offer a UI
        // to find these groups and remove them if desired
        snippet.imported = req.aposImported;
        async.series([
          function(callback) {
            self.authorAsEditor(req, snippet);
            self.beforeInsert(req, data, snippet, callback);
          },
          function(callback) {
            self.beforeSave(req, data, snippet, callback);
          },
          function(callback) {
            self.importSaveItem(req, snippet, callback);
          },
          function(callback) {
            self.afterInsert(req, data, snippet, callback);
          },
          function(callback) {
            self.afterSave(req, data, snippet, callback);
          }
        ], callback);
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

        tags = self._apos.sanitizeTags(req.body.tags);

        snippet = { title: title, published: published, type: self._instance, tags: tags, areas: {}, slug: slug, createdAt: new Date(), publishedAt: new Date() };
        snippet.sortTitle = self._apos.sortify(snippet.title);

        self.convertAllFields('form', req.body, snippet);

        async.series([ permissions, beforeInsert, beforeSave, insert, afterInsert, afterSave ], send);

        function permissions(callback) {
          self._apos.permissions(req, 'edit-' + self._css, null, callback);
        }

        function beforeInsert(callback) {
          self.authorAsEditor(req, snippet);
          return self.beforeInsert(req, req.body, snippet, callback);
        }

        function beforeSave(callback) {
          return self.beforeSave(req, req.body, snippet, callback);
        }

        function insert(callback) {
          return self._apos.putPage(req, slug, snippet, callback);
        }

        function afterInsert(callback) {
          return self.afterInsert(req, req.body, snippet, callback);
        }

        function afterSave(callback) {
          return self.afterSave(req, req.body, snippet, callback);
        }

        function send(err) {
          if (err) {
            console.log(err);
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

        tags = self._apos.sanitizeTags(req.body.tags);

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
          return async.series([
            function(callback) {
              return self.beforeUpdate(req, req.body, snippet, callback);
            },
            function(callback) {
              return self.beforeSave(req, req.body, snippet, callback);
            }
          ], callback);
        }

        function update(callback) {
          async.series([
            function(callback) {
              self._apos.putPage(req, originalSlug, snippet, callback);
            },
            function(callback) {
              self.afterUpdate(req, req.body, snippet, callback);
            },
            function(callback) {
              self.afterSave(req, req.body, snippet, callback);
            }
          ], callback);
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
        async.series([ get, beforeTrash, trashSnippet], respond);

        var slug;
        var snippet;
        var trash = self._apos.sanitizeBoolean(req.body.trash);

        function get(callback) {
          slug = req.body.slug;
          return self.get(req, { slug: slug }, { editable: true, trash: 'any' }, function(err, results) {
            if (err) {
              return callback(err);
            }
            snippet = results.snippets[0];
            if(!snippet) {
              return callback('Not Found');
            }
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
          self._apos.pages.update({ slug: snippet.slug }, action, callback);
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
        var criteria = {};
        var options = {};
        self.addApiCriteria(req.query, criteria, options);
        self.get(req, criteria, options, function(err, results) {
          if (err) {
            res.statusCode = 500;
            return res.send('error');
          }
          return res.send(JSON.stringify(results));
        });
      });

      self._app.get(self._action + '/get-one', function(req, res) {
        var criteria = {};
        var options = {};
        self.addApiCriteria(req.query, criteria, options);
        self.get(req, criteria, options, function(err, results) {
          if (results && results.snippets.length) {
            res.send(JSON.stringify(results.snippets[0]));
          } else {
            res.send(JSON.stringify(null));
          }
        });
      });

      // A good extension point for adding criteria specifically for the /get and
      // get-one API calls used when managing content

      self.addApiCriteria = function(queryArg, criteria, options) {

        // Most of the "criteria" that come in via an API call belong in options
        // (skip, limit, titleSearch, published, etc). Handle any cases that should
        // go straight to the mongo criteria object

        var query = {};
        extend(true, query, queryArg);

        var slug = self._apos.sanitizeString(query.slug);
        if (slug.length) {
          criteria.slug = query.slug;
          // Don't let it become an option too
          delete query.slug;
        }

        // Everything else is assumed to be an option
        extend(true, options, query);

        // Make sure these are converted to numbers, but only if they are present at all
        if (options.skip !== undefined) {
          options.skip = self._apos.sanitizeInteger(options.skip);
        }
        if (options.limit !== undefined) {
          options.limit = self._apos.sanitizeInteger(options.limit);
        }
        options.editable = true;
      };

      // Extension point. The blog module uses this to add
      // publishedAt = 'any'
      self.addExtraAutocompleteCriteria = function(req, criteria, options) {
      };

      // The autocomplete route returns an array of objects with
      // label and value properties, suitable for use with
      // $.selective. The label is the title, the value
      // is the id of the snippet.
      //
      // Send either a `term` parameter, used for autocomplete search,
      // or a `values` array parameter, used to fetch title information
      // about an existing list of ids. If neither is present the
      // request is assumed to be for an empty array of ids and an
      // empty array is returned, not a 404.
      //
      // GET and POST are supported to allow for large `values`
      // arrays.

      self._app.all(self._action + '/autocomplete', function(req, res) {
        var criteria = {};
        var options = {
          fields: self.getAutocompleteFields(),
          limit: req.query.limit || 50,
          skip: req.query.skip
        };
        var data = (req.method === 'POST') ? req.body : req.query;
        if (data.term !== undefined) {
          options.titleSearch = data.term;
        } else if (data.values !== undefined) {
          criteria._id = { $in: data.values };
        } else {
          // Since arrays in REST queries are ambiguous,
          // treat the absence of either parameter as an
          // empty `ids` array
          return res.send(JSON.stringify([]));
        }
        if (data.values && data.values.length && (req.query.limit === undefined)) {
          // We are loading specific items to repopulate a control,
          // so get all of them
          delete options.limit;
        }
        // If requested, allow autocomplete to find unpublished
        // things (published === 'any'). Note that this is still
        // restricted by the permissions of the user making the request.
        if (data.published !== undefined) {
          options.published = data.published;
        }
        self.addExtraAutocompleteCriteria(req, criteria, options);
        // Format it as value & id properties for compatibility with jquery UI autocomplete
        self.get(req, criteria, options, function(err, results) {
          if (err) {
            res.statusCode = 500;
            return res.send('error');
          }
          var snippets = results.snippets;
          // Put the snippets in id order
          if (req.query.values) {
            snippets = self._apos.orderById(req.query.values, snippets);
          }
          return res.send(
            JSON.stringify(_.map(snippets, function(snippet) {
                return { label: self.getAutocompleteTitle(snippet), value: snippet._id };
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
          self.permalink(req, page, bestPage, function(err) {
            if (err) {
              res.statusCode = 404;
              return res.send('Not Found');
            } else {
              return res.redirect(page.url);
            }
          });
        });
      }
    });

    self._apos.addLocal(self._menuName, function(args) {
      var result = self.render('menu', args);
      return result;
    });

    // Make sure that aposScripts and aposStylesheets summon our
    // browser-side UI assets for managing snippets

    self.pushAsset('template', 'new', { when: 'user' });
    self.pushAsset('template', 'edit', { when: 'user' });
    self.pushAsset('template', 'manage', { when: 'user' });
    self.pushAsset('template', 'import', { when: 'user' });
  }

  self.pushAsset('script', 'editor', { when: 'user' });
  self.pushAsset('script', 'content', { when: 'always' });

  // We've decided not to push stylesheets that live in the core
  // Apostrophe modules, because we prefer to write LESS files in the
  // sandbox project that can share imports. But you can add these calls
  // back to your subclasses if you like keeping the LESS files with
  // the modules.

  // self.pushAsset('stylesheet', 'editor', { when: 'user' });
  // self.pushAsset('stylesheet', 'content', { when: 'always' });

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

  // Returns snippets the current user is permitted to read.
  //
  // CRITERIA
  //
  // The criteria argument is combined with the standard MongoDB
  // criteria for fetching snippets via MongoDB's `$and` keyword.
  // This allows you to use any valid MongoDB criteria when
  // fetching snippets.
  //
  // OPTIONS
  //
  // The `options` argument provides *everything offered by
  // the `apos.get` method's `options` argument*, plus the following:
  //
  // PERMALINKING
  //
  // By default no ._url property is set on each item, as you often
  // are rendering items on a specific page and want to set the ._url
  // property to match. If you set the `permalink` option to true, the
  // ._url property will be set for you, based on the findBestPage
  // algorithm.
  //
  // FETCHING METADATA FOR FILTERS
  //
  // If `options.fetch.tags` is true, the `results` object will also
  // contain a `tags` property, containing all tags that are present on
  // the snippets when the criteria are taken into account
  // (ignoring limit and skip). This is useful to present a
  // "filter by tag" interface.
  //
  // LIMITING METADATA RESULTS
  //
  // When you set options.fetch.tags to `true`, the `.tags` property
  // returned is NOT restricted by any `tags` criteria present in
  // `optionsArg`, so that you may present alternatives to the tag you
  // are currently filtering by.
  //
  // However, you may still need to restrict the tags somewhat, for
  // instance because the entire page is locked down to show only things
  // tagged red, green or blue.
  //
  // You could do this after the fact but that would require MongoDB to
  // do more work up front. So for efficiency's sake, you can supply an
  // object as the value of options.fetch.tags, with an `only` property
  // restricting the possible results:
  //
  // options.fetch.tags = { only: [ 'red', 'green', 'blue' ] }
  //
  // Conversely, you may need to ensure a particular tag *does* appear
  // in `results.tags` even if it never appears in the snippets returned,
  // usually because it is the tag the user is manually filtering by
  // right now:
  //
  // Include 'blue' in the result even if it matches no snippets
  //
  // options.fetch.tags = { only: [ 'red', 'green', 'blue' ], always: 'blue' }

  self.get = function(req, userCriteria, optionsArg, callback) {
    var options = {};
    var filterCriteria = {};
    var results = null;
    extend(true, options, optionsArg);
    // For snippets the default sort is alpha
    if (options.sort === undefined) {
      options.sort = { sortTitle: 1 };
    }
    // filterCriteria is the right place to build up criteria
    // specific to this method; we'll $and it with the user's
    // criteria before passing it on to apos.get
    filterCriteria.type = self._instance;
    var fetch = options.fetch;
    var permalink = options.permalink;

    // Final criteria to pass to apos.get
    var criteria = {
      $and: [
        userCriteria,
        filterCriteria
      ]
    };

    return async.series([ query, metadata, permalinker ], function(err) {
      return callback(err, results);
    });

    function query(callback) {
      return self._apos.get(req, criteria, options, function(err, resultsArg) {
        if (err) {
          return callback(err);
        }
        results = resultsArg;
        results.snippets = results.pages;
        delete results.pages;
        return callback(null);
      });
    }

    function metadata(callback) {
      if (fetch) {
        return self.fetchMetadataForFilters(req, fetch, criteria, options, results, callback);
      } else {
        return callback(null);
      }
    }

    function permalinker(callback) {
      if (permalink) {
        if (permalink === true) {
          // Find the best page for each one
          return self.addUrls(req, results.snippets, callback);
        } else {
          // permalink is a specific page object
          return self.addUrls(req, results.snippets, permalink, callback);
        }
      } else {
        return callback(null);
      }
    }
  };

  self.getOne = function(req, criteria, optionsArg, callback) {
    var options = {};
    extend(true, options, optionsArg);
    options.limit = 1;
    if (!options.skip) {
      options.skip = 0;
    }
    return self.get(req, criteria, options, function(err, results) {
      if (err) {
        return callback(err);
      }
      return callback(err, results.snippets[0]);
    });
  };

  // Add additional metadata like available tags to `results`. We take advantage
  // of the specified criteria and options to display only the choices that will
  // return results. For instance, for tags, we fetch only tags that appear on
  // at least one snippet that meets the other criteria that are currently active.
  // This lets us avoid displaying filters that point to empty pages.
  //
  // Apostrophe retrieves the choices for a given filter only if
  // `fetch.yourfiltername` is set. If `fetch.yourfiltername.only` is set
  // we respect that limitation on the allowed values. If `fetch.always` is
  // set we always include that particular value in the results even if there
  // are no matches.

  self.fetchMetadataForFilters = function(req, fetch, criteria, options, results, callback) {
    // Written to accommodate fetching other filters' options easily
    async.eachSeries(_.keys(fetch), fetchProperty, function(err) {
      if (err) {
        return callback(err);
      }
      return callback(null);
    });

    function fetchProperty(property, callback) {
      var getPropertyOptions = {};
      extend(true, getPropertyOptions, options);
      getPropertyOptions.getDistinct = property;
      // If we are filtering by one tag at the user's discretion,
      // get a list of all other tags as alternative filter choices.
      // But don't get tags that are not on the permitted list for
      // this page.
      if (req.query[property]) {
        delete getPropertyOptions[property];
        if (req.page.typeSettings[property] && req.page.typeSettings[property].length) {
          getPropertyOptions[property] = req.page.typeSettings[property];
        }
      }
      self._apos.get(req, criteria, getPropertyOptions, function(err, values) {
        if (err) {
          console.log(err);
          return callback(err);
        }
        results[property] = values;
        if (fetch[property].only) {
          results[property] = _.filter(results[property], function(tag) {
            return _.contains(fetch[property].only, tag);
          });
        }
        if (fetch[property].never) {
          results[property] = _.filter(results[property], function(tag) {
            return !_.contains(fetch[property].only, tag);
          });
        }
        if (fetch[property].always) {
          if (!_.contains(results[property], fetch[property].always)) {
            results[property].push(fetch[property].always);
          }
        }
        // alpha sort
        results[property].sort();
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
    var options = { permalink: req.bestPage };
    var show = false;
    var slug = self.isShow(req);
    if (slug !== false) {
      show = true;
      criteria.slug = slug;
    } else {
      self.addPager(req, options);
    }
    self.addCriteria(req, criteria, options);
    // If we are requesting a specific slug, remove the tags criterion.
    // In theory we should be strict about this, but in practice this is
    // sometimes necessary to make sure permalink pages are available when
    // users have not created any really appropriate snippet page. TODO:
    // consider whether to go back to being strict, after we resolve
    // any concerns with DR.
    if (slug) {
      delete criteria.tags;
    }
    return self.get(req, criteria, options, function(err, results) {
      if (err) {
        return callback(err);
      }

      req.extras.allTags = results.tags;

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

  self.addPager = function(req, options) {
    var pageNumber = self._apos.sanitizeInteger(req.query.page, 1, 1);
    req.extras.pager = {
      page: pageNumber
    };
    options.skip = self._perPage * (pageNumber - 1);
    options.limit = self._perPage;
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
    return self.beforeShow(req, snippet, callback);
  };

  // Called by self.index to decide what the index template name is.
  // "index" is the default. If the request is an AJAX request, we assume
  // infinite scroll and render "indexAjax".
  self.setIndexTemplate = function(req) {
    if (req.xhr && (!req.query.apos_refresh)) {
      req.template = self.renderer('indexAjax');
    } else {
      req.template = self.renderer('index');
    }
  };

  // The standard implementation of an 'index' page for many snippets, for your
  // overriding convenience
  self.index = function(req, snippets, callback) {
    // The infinite scroll plugin is expecting a 404 if it requests
    // a page beyond the last one. Without it we keep trying to load
    // more stuff forever
    if (req.xhr && (req.query.page > 1) && (!snippets.length)) {
      req.notfound = true;
      return callback(null);
    }
    self.setIndexTemplate(req);
    // Generic noun so we can more easily inherit templates
    req.extras.items = snippets;
    return self.beforeIndex(req, snippets, callback);
  };

  // For easier subclassing, these callbacks are invoked at the last
  // minute before the template is rendered. You may use them to extend
  // the data available in req.extras, etc. To completely override
  // the "show" behavior, override self.show or self.dispatch.
  self.beforeShow = function(req, snippet, callback) {
    return callback(null);
  };

  // For easier subclassing, these callbacks are invoked at the last
  // minute before the template is rendered. You may use them to extend
  // the data available in req.extras, etc. To completely override
  // the "index" behavior, override self.index or self.dispatch.
  self.beforeIndex = function(req, snippets, callback) {
    return callback(null);
  };

  self.addCriteria = function(req, criteria, options) {
    options.fetch = {
      tags: {}
    };
    if (req.page.typeSettings) {
      if (req.page.typeSettings.tags && req.page.typeSettings.tags.length) {
        options.tags = req.page.typeSettings.tags;
        // This restriction also applies when fetching distinct tags
        options.fetch.tags.only = req.page.typeSettings.tags;
      }
      if (req.page.typeSettings.notTags && req.page.typeSettings.notTags.length) {
        options.notTags = req.page.typeSettings.notTags;
        // This restriction also applies when fetching distinct tags
        options.fetch.tags.except = req.page.typeSettings.notTags;
      }
    }
    if (req.query.tag) {
      // Override the criteria for fetching snippets but leave options.fetch.tags
      // alone
      var tag = self._apos.sanitizeString(req.query.tag);
      if (tag.length) {
        options.tags = [ tag ];
        // Always return the active tag as one of the filter choices even if
        // there are no results in this situation. Otherwise the user may not be
        // able to see the state of the filter (for instance if it is expressed
        // as a select element)
        options.fetch.tags.always = tag;
      }
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
  //
  // If this algorithm is basically right for your subclass of snippets, but you
  // want to match on a different property of the page's typeSettings object
  // rather than tags, you can set self.bestPageMatchingProperty. If this property
  // contains an array of snippet IDs, you can set self.bestPageById.
  //
  // For instance, the groups module does this:
  //
  // self.bestPageMatchingProperty = 'groupIds';
  // self.bestPageById = true;
  //
  // If your needs for comparing the fitness of pages are greatly different you'll need
  // to override the entire method.

  self.findBestPage = function(req, snippet, callback) {
    if (req.aposBestPageCache && req.aposBestPageCache[snippet.type]) {
      return go();
    }
    var typeNames = _.map(typesByInstanceType[snippet.type] || [], function(type) { return type.name; });
    // Make sure we don't get the areas which would result in
    // super expensive callLoadersForPage calls
    return self._apos.get(req, { type: { $in: typeNames }, slug: /^\// }, { fields: { areas: 0 } }, function(err, results) {
      if (err) {
        console.log('error is:');
        console.log(err);
        return callback(err);
      }
      var pages = results.pages;
      if (!req.aposBestPageCache) {
        req.aposBestPageCache = {};
      }
      req.aposBestPageCache[snippet.type] = pages;
      go();
    });

    function go() {
      var property = self.bestPageMatchingProperty || 'tags';
      var viewable = req.aposBestPageCache[snippet.type];
      var tags = self.bestPageById ? ([ snippet._id ]) : (snippet[property] || []);
      var bestScore;
      var best = null;
      _.each(viewable, function(page) {
        var score = 0;
        var pageTags = (page.typeSettings && page.typeSettings[property]) ? page.typeSettings[property] : [];
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

  // Sets the .url property of the snippet to a good permalink URL,
  // beginning with the slug of the specified page. See findBestPage
  // for a good way to choose a page beneath which to link this snippet.
  //
  // It is commonplace to override this function. For instance,
  // blog posts add the publication date to the URL.
  //
  // TODO: this exposes that we're not really letting people change
  // the root of the site from / yet. We need to make that a global
  // option to the pages module and not just an option to pages.serve,
  // or perhaps stuff it into req if we're really going to support
  // multiple "sites" per domain etc.

  // This method must be efficient. Cache information in the req object
  // to avoid making the same database query thousands of times as part
  // of satisfying a single HTTP request.

  // Default version is very simple but some subclasses may need to
  // fetch additional information even though the best/current page
  // is already known (in particular, the people module).

  self.permalink = function(req, snippet, page, callback) {
    snippet.url = page.slug + '/' + snippet.slug;
    return callback(null);
  };

  // Add the .url property to snippets so they can be clicked through
  // If 'page' is specified, link them all to that page. If 'page' is
  // skipped, discover the best page to link each one to

  self.addUrls = function(req, snippets, page, callback) {
    if (arguments.length === 4) {
      // Link them all to one page
      return async.each(snippets, function(snippet, callback) {
        return self.permalink(req, snippet, page, callback);
       }, callback);
    }

    // Find best page for each
    callback = page;
    page = null;

    async.eachSeries(snippets, function(snippet, callback) {
      self.findBestPage(req, snippet, function(err, page) {
        if (err) {
          return callback(err);
        }
        if (page) {
          return self.permalink(req, snippet, page, callback);
        }
        return callback(null);
      });
    }, callback);
  };

  // CUSTOM PAGE SETTINGS TEMPLATE
  self.pushAsset('template', 'pageSettings', { when: 'user' });

  // Sanitize newly submitted page settings (never trust a browser)
  extend(true, self, {
    settings: {
      sanitize: function(data, callback) {
        var ok = {};
        ok.tags = self._apos.sanitizeTags(data.tags);
        ok.notTags = self._apos.sanitizeTags(data.notTags);
        return callback(null, ok);
      }
    }
  });

  // WIDGET SETUP, ALSO BROWSER-SIDE SETUP FOR THE PAGE TYPE

  // It's possible to show a collection of recent snippets publicly
  // on a page, and also to access permalink pages for snippets.
  // We might use this directly, but we'll definitely use it in most
  // modules that inherit from this one such as blog and events, which
  // is why it is valuable for it to be supported here.

  // Register the snippet-reuse widget unless we've been told not to
  _.defaults(options, { widget: true });

  var browser = options.browser || {};
  self._browser = browser;
  var pages = browser.pages || 'aposPages';
  var construct = getBrowserConstructor();
  self._pages.addType(self);
  var args = {
    name: self.name,
    label: self.label,
    instance: self._instance,
    icon: self._icon,
    css: self._css,
    typeCss: self._typeCss,
    manager: self.manager,
    action: self._action,
    convertFields: self.convertFields
  };
  extend(true, args, browser.options || {});

  // Synthesize a constructor for this type on the browser side if there
  // isn't one. This allows trivial subclassing of snippets for cases where
  // no custom browser side code is actually needed
  self._apos.pushGlobalCallWhen('user', 'AposSnippets.subclassIfNeeded(?, ?, ?)', getBrowserConstructor(), getBaseBrowserConstructor(), args);
  self._apos.pushGlobalCallWhen('user', '@.replaceType(?, new @(?))', pages, self.name, construct, args);

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
    self._apos.pushGlobalCallWhen('user', '@.addWidgetType()', construct);
  }

  function getBrowserConstructor() {
    return self._browser.construct || 'Apos' + self.name.charAt(0).toUpperCase() + self.name.substr(1);
  }

  // Figure out the name of the base class constructor on the browser side. If
  // it's not available set a dummy name; this will work out OK because this
  // typically means subclassing was done explicitly on the browser side.
  function getBaseBrowserConstructor() {
    return self._browser.baseConstruct || 'AposPresumablyExplicit';
  }

  if (callback) {
    // Invoke callback on next tick so that the constructor's return
    // value can be assigned to a variable in the same closure where
    // the callback resides
    process.nextTick(function() { return callback(null); });
  }
};

// The first type object registered with the right type name
// is the manager, responsible for the backend of the editor

snippets.getManager = function(snippet) {
  return _.find(typesByInstanceType[snippet.type] || [], function(type) {
    return type.manager;
  });
};

snippets.widget = widget;
