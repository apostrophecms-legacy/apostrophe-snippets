var async = require('async');
var _ = require('underscore');
var extend = require('extend');
var fs = require('fs');
var widget = require(__dirname + '/widget.js');
var async = require('async');
var csv = require('csv');
var moment = require('moment');
var RSS = require('rss');
var url = require('url');
var absolution = require('absolution');

module.exports = snippets;

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
  self._searchable = (options.searchable !== undefined) ? options.searchable : true;
  self._options = options;
  self._perPage = options.perPage || 10;

  // Set defaults for feeds, but respect it if self._options.feed has been
  // explicitly set false
  if (self._options.feed === undefined) {
    self._options.feed = {};
  }
  if (self._options.feed) {
    var defaultPrefix;
    // Let apostrophe-site clue us in to the name of the site so our feed title
    // is not as bare as "Blog" or "Calendar"
    if (self._options.site && self._options.site.title) {
      // endash
      defaultPrefix = self._options.site.title + (self._options.feed.titleSeparator || ' – ');
    } else {
      defaultPrefix = '';
    }
    _.defaults(self._options.feed, {
      // Show the thumbnail singleton if available
      thumbnail: true,
      // If the thumbnail is not available and the body contains an image,
      // show that instead
      alternateThumbnail: true,
      titlePrefix: defaultPrefix
    });
  }

  // Mix in the ability to serve assets and templates
  self._apos.mixinModuleAssets(self, 'snippets', __dirname, options);

  // These are "public" so the object can be passed directly to pages.addType
  self.name = options.name || 'snippets';
  // Label for the page type
  self.label = options.label || 'Snippets';
  // Usually but not always the same as the label for the page type
  // (example: "Directory" vs. "Groups")
  self.pluralLabel = options.pluralLabel || self.label;
  self.instanceLabel = options.instanceLabel || 'Snippet';
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

  // Given the value of the "feed" query parameter, return the appropriate
  // content type. Right now feed is always rss and the return value is always
  // application/rss+xml, but you can override to handle more types of feeds
  self.feedContentType = function(feed) {
    return 'application/rss+xml';
  };

  // Render a feed as a string, using the same data that we'd otherwise pass
  // to the index template, notably data.items. req.query.feed specifies the
  // type of feed, currently we assume RSS
  self.renderFeed = function(data, req) {
    // Lots of information we don't normally have in a page renderer.
    var feedOptions = {
      title: self._options.feed.title || ((self._options.feed.titlePrefix || '') + data.page.title),
      description: self._options.feed.description,
      generator: self._options.feed.generator || 'Apostrophe 2',
      feed_url: req.absoluteUrl,
      // Strip the ?feed=rss back off, in a way that works if there are other query parameters too
      site_url: self._apos.build(req.absoluteUrl, { feed: null }),
      image_url: self._options.feed.imageUrl
    };
    _.defaults(feedOptions, {
      description: feedOptions.title
    });
    var feed = new RSS(feedOptions);
    _.each(data.items, function(item) {
      feed.item(self.renderFeedItem(item, req));
    });
    return feed.xml('  ');
  };

  // Returns an object ready to be passed to the .item method of the rss module
  self.renderFeedItem = function(item, req) {
    var feedItem = {
      title: item.title,
      description: self.renderFeedItemDescription(item, req),
      // Make it absolute
      url: url.resolve(req.absoluteUrl, item.url),
      guid: item._id,
      author: item.author || item._author || undefined,
      // A bit of laziness that covers derivatives of our blog, our events,
      // and everything else
      date: item.publishedAt || item.start || item.createdAt
    };
    return feedItem;
  };

  /**
   * Given an item and a req object, should return HTML suitable for use in an RSS
   * feed to represent the body of the item. Note that any URLs must be absolute.
   * Hint: req.absoluteUrl is useful to resolve relative URLs. Also the
   * absolution module.
   * @param  {Object} item The snippet in question
   * @param  {Object} req  Express request object
   * @return {String}      HTML representation of the body of the item
   */
  self.renderFeedItemDescription = function(item, req) {
    // Render a partial for this individual feed item. This lets us use
    // aposArea and aposSingleton normally etc.
    var result = self.renderer('feedItem')({
      page: req.page,
      item: item,
      url: req.absoluteUrl,
      options: self._options.feed
    });
    // We have to resolve all the relative URLs that might be kicking around
    // in the output to generate valid HTML for use in RSS
    result = absolution(result, req.absoluteUrl).trim();
    return result;
  };

  // If there is no manager yet for our instance type, then we will be the manager, and
  // should set up backend routes accordingly
  self.manager = !self._pages.getManager(self._instance);

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

    self.schema = [
      {
        // This one will always import as an empty area for now when importing CSV.
        // TODO: allow URLs in CSV to be imported.
        name: 'thumbnail',
        label: 'Thumbnail',
        type: 'singleton',
        widgetType: 'slideshow',
        options: {
          limit: 1,
          label: 'Thumbnail'
        }
      },
      {
        name: 'body',
        type: 'area',
        label: 'Body',
        // options: {
        //   slideshow: {
        //     limit: 1
        //   }
        // }
      },
      {
        name: 'hideTitle',
        label: 'Hide Title',
        type: 'boolean',
        def: false
      }
    ];

    // addFields adds or overrides fields in the schema, preserving its order
    if (options.addFields) {
      var newFields = [];
      var replacementsMade = {};
      _.each(self.schema, function(field) {
        var replacement = _.find(options.addFields, function(addField) {
          return field.name === addField.name;
        });
        if (replacement) {
          newFields.push(replacement);
          replacementsMade[newFields.name] = true;
        } else {
          newFields.push(field);
        }
      });
      _.each(options.addFields, function(field) {
        if (!replacementsMade[field.name]) {
          newFields.push(field);
        }
      });
      self.schema = newFields;
    }

    // removeFields removes fields from the schema, preserving its order
    if (options.removeFields) {
      self.schema = _.filter(self.schema, function(field) {
        return !_.contains(options.removeFields, field.name);
      });
    }

    // orderFields changes the order of fields. Any fields not specified
    // go to the end, in their old order (see removeFields). Subclasses
    // should honor any setting passed by a sub-subclass before their own default

    if (options.orderFields) {
      var fieldsObject = {};
      var copied = {};
      _.each(self.schema, function(field) {
        fieldsObject[field.name] = field;
      });
      self.schema = [];
      _.each(options.orderFields, function(name) {
        if (fieldsObject[name]) {
          self.schema.push(fieldsObject[name]);
        }
        copied[name] = true;
      });
      _.each(fieldsObject, function(field, name) {
        if (!copied[name]) {
          self.schema.push(field);
        }
      });
    }

    // alterFields is a custom function that alters the schema. Hopefully
    // hardly ever used thanks to addFields, removeFields and orderFields
    if (options.alterFields) {
      options.alterFields(self.schema);
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
      }
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

    self.converters.form.joinByOne = function(data, name, snippet, field) {
      snippet[field.idField] = self._apos.sanitizeId(data[name]);
    };

    self.converters.form.joinByOneReverse = function(data, name, snippet, field) {
      // Not edited on this side of the relation
    };

    self.converters.form.joinByArray = function(data, name, snippet, field) {
      var input = data[name] || [];
      if (!Array.isArray(input)) {
        input = [];
      }
      snippet[field.idsField] = [];
      if (field.extras) {
        snippet[field.extrasField] = {};
      }

      // Clear old values before we sanitize new, so we don't get orphans
      if (field.relationshipsField) {
        snippet[field.relationshipsField] = {};
      }
      // Each element may be an id or an object with a 'value' property
      // containing the id as well as optional extra properties
      _.each(input, function(e) {
        var id;
        if (typeof(e) === 'object') {
          id = e.value;
        } else {
          id = e;
        }
        id = self._apos.sanitizeId(id);
        if (id !== undefined) {
          snippet[field.idsField].push(id);
          if (field.relationship) {
            if (typeof(e) !== 'object') {
              // Behave reasonably if we got just ids instead of objects
              e = {};
            }
            // Validate the relationship (aw)
            var validatedRelationship = {};
            _.each(field.relationship, function(attr) {
              if (attr.type === 'string') {
                validatedRelationship[attr.name] = self._apos.sanitizeString(e[attr.name]);
              } else if (attr.type === 'boolean') {
                validatedRelationship[attr.name] = self._apos.sanitizeBoolean(e[attr.name]);
              } else if (attr.type === 'select') {

                validatedRelationship[attr.name] = self._apos.sanitizeSelect(e[attr.name], attr.choices);
              } else {
                console.log(snippet.name + ': unknown type for attr attribute of relationship ' + name + ', ignoring');
              }
            });
            snippet[field.relationshipsField][id] = validatedRelationship;
          }
        }
      });
    };

    self.converters.form.joinByArrayReverse = function(data, name, snippet, field) {
      // Not edited on this side of the relation
    };

    self.convertAllFields = function(from, data, snippet) {
      return self.convertSomeFields(self.schema, from, data, snippet);
    };

    self.convertSomeFields = function(schema, from, data, snippet) {
      _.each(schema, function(field) {
        self.converters[from][field.type](data, field.name, snippet, field);
      });
    };

    // Make each type of schema field searchable. You can shut this off
    // for any field by setting its `search` option to false. Not all
    // field types make sense for search. Areas and singletons are always
    // searchable. The `weight` option makes a property more significant
    // in search; in the current implementation weights greater than 10
    // are treated more prominently. By default all schema fields are
    // treated as more important than ordinary body text. You can change
    // that by setting a lower weight. The "silent" option, which is true
    // by default, prevents the field from showing up in the summary of
    // the item presented with search results.

    self.indexers = {
      string: function(value, field, texts) {
        var silent = (field.silent === undefined) ? true : field.silent;
        texts.push({ weight: field.weight || 15, text: value, silent: silent });
      },
      select: function(value, field, texts) {
        var silent = (field.silent === undefined) ? true : field.silent;
        texts.push({ weight: field.weight || 15, text: value, silent: silent });
      }
      // areas and singletons are always indexed
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
            self.importSaveItem(req, data, snippet, callback);
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

    // Save an item that was just created by the importer. The default
    // implementation just calls self.putOne for the snippet, as the
    // data has already been copied to it; however your subclasses may
    // wish to use properties of data that the base class is unaware of.
    self.importSaveItem = function(req, data, snippet, callback) {
      return self.putOne(req, snippet.slug, snippet, callback);
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
          return self.putOne(req, slug, snippet, callback);
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
          // Fetch the object via getPage so that permissions are considered properly,
          // but bypass self.get so that we don't do expensive joins or
          // delete password fields or otherwise mess up what is essentially
          // just an update operation.
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
              return self.putOne(req, originalSlug, snippet, callback);
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
        var active = 0;
        var date = new Date();
        req.aposImported = moment().format();
        // "AUGH! Why are you using toArray()? It wastes memory!"
        // Because: https://github.com/wdavidw/node-csv/issues/93
        // Also we don't want race conditions when, for instance, people try to add
        // themselves to a group and save the group twice.
        // TODO: write a CSV module that is less ambitious about speed and more
        // interested in a callback driven, serial interface
        return csv().from.stream(fs.createReadStream(file.path)).to.array(function(data) {
          var index = 0;
          return async.eachSeries(data, function(row, callback) {
            var headings = !index;
            index++;
            if (headings) {
              return handleHeadings(row, callback);
            } else {
              return handleRow(row, function(err) {
                if (!err) {
                  rows++;
                  return callback(null);
                } else {
                  return callback(err);
                }
              });
            }
          }, function(err) {
            if (err) {
              return respondWhenDone('error');
            }
            return respondWhenDone('ok');
          });
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
          return self.importCreateItem(req, data, callback);
        }

        function respondWhenDone(status) {
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

    // Improve the search index by adding custom searchable texts.
    // Note that you do not need to override this method just to make
    // schema properties of type "text", "select", "area" or "singleton"
    // searchable, or to cover "title" and "tags."
    //
    // Extend this to add more search texts representing metadata relating to
    // this type of snippet. Example: texts.push({ weight: 20, text: snippet.address })
    //
    // The default search engine is very simple: searches that match
    // something weighted greater than 10 appear before everything else.

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
        _.each(self.schema, function(field) {
          if (field.search === false) {
            return;
          }
          if (!self.indexers[field.type]) {
            return;
          }
          self.indexers[field.type](snippet[field.name], field, lines);
        });
        // Custom search indexing
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

    // Make sure that aposScripts and aposStylesheets summon our
    // browser-side UI assets for managing snippets

    // Useful data when rendering menus, edit modals, manage modals, etc.
    // Use of these variables makes it safe to use the snippet menu and modals
    // for newly invented types too at least as a starting point, and they can be
    // safely copied and pasted and edited as well

    var data = {
      fields: self.schema,
      alwaysEditing: self._apos.alwaysEditing,
      newClass: 'apos-new-' + self._css,
      instanceLabel: self.instanceLabel,
      editClass: 'apos-edit-' + self._css,
      manageClass: 'apos-manage-' + self._css,
      importClass: 'apos-import-' + self._css,
      label: self.label,
      pluralLabel: self.pluralLabel,
      newButtonData: 'data-new-' + self._css,
      editButtonData: 'data-edit-' + self._css,
      manageButtonData: 'data-manage-' + self._css,
      importButtonData: 'data-import-' + self._css,
      menuIcon: 'icon-' + self.icon,
      pageSettingsClass: 'apos-page-settings-' + self._apos.cssName(self.name)
    };

    self._apos.addLocal(self._menuName, function(args) {
      _.defaults(args, data);
      var result = self.render('menu', args);
      return result;
    });

    self.pushAsset('template', 'new', { when: 'user', data: data });
    self.pushAsset('template', 'edit', { when: 'user', data: data });
    self.pushAsset('template', 'manage', { when: 'user', data: data });
    self.pushAsset('template', 'import', { when: 'user', data: data });
  }

  // CUSTOM PAGE SETTINGS TEMPLATE
  self.pushAsset('template', 'pageSettings', {
    when: 'user',
    data: {
      label: self.label,
      instanceLabel: self.instanceLabel,
      pluralLabel: self.pluralLabel,
      pageSettingsClass: 'apos-page-settings-' + self._apos.cssName(self.name)
    }
  });

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

  // Add static routes that serve assets for this module and all of its ancestors
  self.serveAssets();

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
  //
  // Ignore `options.tags` in favor of the hard restrictions for the page
  // or no restrictions at all in order to repopulate the filter properly
  // when a selection is already present in req.query.tag
  //
  // options.fetch.tags { parameter: 'tag' }

  self.get = function(req, userCriteria, optionsArg, mainCallback) {
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

    // Used to implement 'join', below

    var joinrs = {
      joinByOne: function(field, options, callback) {
        return self._apos.joinByOne(req, results.snippets, field.idField, field.name, options, callback);
      },
      joinByOneReverse: function(field, options, callback) {
        return self._apos.joinByOneReverse(req, results.snippets, field.idField, field.name, options, callback);
      },
      joinByArray: function(field, options, callback) {
        return self._apos.joinByArray(req, results.snippets, field.idsField, field.relationshipsField, field.name, options, callback);
      },
      joinByArrayReverse: function(field, options, callback) {
        return self._apos.joinByArrayReverse(req, results.snippets, field.idsField, field.relationshipsField, field.name, options, callback);
      }
    };

    return async.series([ query, join, metadata, permalinker ], function(err) {
      return mainCallback(err, results);
    });

    function query(callback) {
      return self._apos.get(req, criteria, options, function(err, resultsArg) {
        if (err) {
          return callback(err);
        }
        results = resultsArg;
        if (!results.pages) {
          // getDistinct and perhaps other options that do not return actual snippets;
          // allow the results object through without further processing
          return mainCallback(null, results);
        }
        results.snippets = results.pages;
        delete results.pages;
        return callback(null);
      });
    }

    function join(callback) {
      var withJoins = options.withJoins;
      if (withJoins === false) {
        // Joins explicitly deactivated for this call
        return callback(null);
      }
      if (!results.snippets.length) {
        // Don't waste effort
        return callback(null);
      }
      // Only interested in joins
      var joins = _.filter(self.schema, function(field) {
        return !!joinrs[field.type];
      });
      if (results.snippets.length > 1) {
        // Only interested in joins that are not restricted by ifOnlyOne.
        // This mechanism saves time and memory in cases where you don't need
        // the results of the join in index views
        joins = _.filter(joins, function(join) {
          return !join.ifOnlyOne;
        });
      }
      // The withJoins option allows restriction of joins. Set to false
      // it blocks all joins. Set to an array, it allows the joins named within.
      // If some of those names use dot notation, a chain of nested joins to be
      // permitted can be specified.
      //
      // By default, all configured joins will take place, but withJoins: false
      // will be passed when fetching the objects on the other end of the join,
      // so that infinite recursion never takes place.

      var withJoinsNext = {};
      // Explicit withJoins option passed to us
      if (Array.isArray(withJoins)) {
        joins = _.filter(joins, function(join) {
          var winner;
          _.each(withJoins, function(withJoinName) {
            if (withJoinName === join.name) {
              winner = true;
            }
            if (withJoinName.substr(0, join.name.length + 1) === (join.name + '.')) {
              if (!withJoinsNext[join.name]) {
                withJoinsNext[join.name] = [];
              }
              withJoinsNext[join.name].push(withJoinName.substr(join.name.length + 1));
              winner = true;
            }
          });
          return winner;
        });
      } else {
        // No explicit withJoins option for us, so we do all the joins
        // we're configured to do, and pass on the withJoins options we
        // have configured for those
        _.each(joins, function(join) {
          if (join.withJoins) {
            withJoinsNext[join.name] = join.withJoins;
          }
        });
      }
      return async.eachSeries(joins, function(join, callback) {
        if (!join.name.match(/^_/)) {
          console.error('WARNING: joins should always be given names beginning with an underscore (_). Otherwise you will waste space in your database storing the results');
        }
        var options = {
          get: self._pages.getManager(join.withType).get,
          getOptions: {
            withJoins: withJoinsNext[join.name] || false,
            permalink: true
          }
        };
        return joinrs[join.type](join, options, callback);
      }, callback);
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

  /**
   * Store or update a snippet. If options.permissions is explicitly
   * false, permissions are not checked.
   *
   * You may skip the slug and options parameters. The slug parameter
   * must be the CURRENT slug of the snippet; you can change the slug
   * by changing the slug property of the snippet object, and passing
   * the OLD slug as the slug parameter.
   *
   * If you skip slug, the slug property of the snippet is used. This
   * is only appropriate if you are definitely not changing the slug.
   *
   * To add additional behavior provide self.beforePutOne and
   * self.afterPutOne methods. These start out empty but bear in mind
   * that intermediate subclasses may set them.
   */
  self.putOne = function(req, slug, options, snippet, callback) {
    // Allow slug and options parameters to be skipped
    var recoverSlug = false;
    if (typeof(slug) !== 'string') {
      callback = snippet;
      snippet = options;
      options = slug;
      recoverSlug = true;
    }
    if (!callback) {
      callback = snippet;
      snippet = options;
      options = {};
    }
    if (recoverSlug) {
      slug = snippet.slug;
    }

    if (!snippet.type) {
      snippet.type = self._instance;
    }
    return self.beforePutOne(req, slug, options, snippet, function(err) {
      if (err) {
        return callback(err);
      }
      return self._apos.putPage(req, slug, options, snippet, function(err) {
        if (err) {
          return callback(err);
        }
        return self.afterPutOne(req, slug, options, snippet, callback);
      });
    });
  };

  /**
   * Override me to have a last chance to alter the snippet or
   * check permissions before putOne stores it
   */
  self.beforePutOne = function(req, slug, options, snippet, callback) {
    return callback(null);
  };

  /**
   * Override me to do something after putOne stores a snippet, such as
   * syncing to a second system
   */
  self.afterPutOne = function(req, slug, options, snippet, callback) {
    return callback(null);
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
  //
  // If `fetch.yourfiltername.parameter` is set and
  // `req.query[fetch.yourfiltername.parameter]` is nonempty we replace
  // options[property] with the hard restrictions for this property on the page,
  // or with no restrictions at all. This populates the filter properly when
  // a filtered set of results is already being displayed.

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
      if (fetch[property].parameter && req.query[fetch[property].parameter]) {
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
  // is known (results.total in the get callback). Also sets an appropriate
  // limit if an RSS feed is to be generated.

  self.addPager = function(req, options) {
    var pageNumber = self._apos.sanitizeInteger(req.query.page, 1, 1);
    req.extras.pager = {
      page: pageNumber
    };
    if (req.query.feed) {
      // RSS feeds are not paginated and generally shouldn't contain more than
      // 50 entries because many feedreaders will reject overly large feeds,
      // but provide an option to override this. Leave req.extras.pager in place
      // to avoid unduly upsetting code that primarily deals with pages
      options.skip = 0;
      options.limit = self._options.feed.limit || 50;
      return;
    }
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
  // infinite scroll and render "indexAjax". If req.query.feed is present, we render an RSS feed
  self.setIndexTemplate = function(req) {
    if (req.query.feed && self._options.feed) {
      // No layout wrapped around our RSS please
      req.decorate = false;
      req.contentType = self.feedContentType(req.query.feed);
      req.template = self.renderFeed;
    } else {
      if ((req.xhr || req.query.xhr) && (!req.query.apos_refresh)) {
        req.template = self.renderer('indexAjax');
      } else {
        req.template = self.renderer('index');
      }
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
      tags: { parameter: 'tag' }
    };
    if (req.page.typeSettings) {
      if (req.page.typeSettings.tags && req.page.typeSettings.tags.length) {
        options.tags = req.page.typeSettings.tags;
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
        // Page is not tag restricted, or user is filtering by a tag included on that
        // list, so we can just use the filter tag as options.tag
        if ((!options.tags) || (!options.tags.length) ||
          (_.contains(options.tags, tag))) {
          options.tags = [ tag ];
        } else {
          // Page is tag restricted and user wants to filter by a related tag not
          // on that list - we must be more devious so that both sets of
          // restrictions apply
          criteria.tags = { $in: options.tags };
          options.tags = [ tag ];
        }
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
    var typeNames = self._pages.getIndexTypeNames(snippet);
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
    snippet.url = self._apos.addSlashIfNeeded(page.slug) + snippet.slug;
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
    schema: self.schema
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

snippets.widget = widget;
