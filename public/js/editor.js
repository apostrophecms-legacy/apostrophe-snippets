// NOTES FOR REUSE:
//
// If you create a new snippet page type on the server side, there must also be
// a matching constructor on the browser side which extends this one. If your
// page type (not instance type) is "blog" then your constructor must be named
// "AposBlog".
//
// After calling the constructor you can $.extend it with methods as follows.
// Note that "manager" refers to the main dialog presenting a list of many items
// and "editor" refers to the editor dialog for just one item. "beforeUpdate" and
// "beforeInsert" relate to the save operation of the editor dialog.
//
// For simplicity all CSS names and data attribute names that need to be distinct to
// this data type end with a hyphenated version of your instance option. Note that
// this will be singular in all cases.
//
// addingToManager($el, $snippet, snippet)   <-- note no callback, keep it fast & simple
// afterPopulatingManager($el, $snippets, snippets, callback)
// afterPopulatingEditor($el, snippet, callback) <-- Sync custom fields from snippet to $el
// beforeUpdate($el, data) <-- Sync custom fields from $el to data
// beforeInsert($el, data) <-- Same for new items rather than existing items
//
// By default, if snippets are available as a page type, a custom page settings field is
// presented allowing the user to pick the tags used to select snippets for display.
// You can override this behavior and add your own fields with these methods, which are
// grouped in the settings property:
//
// settings.serialize($el) <-- Sync custom page settings from typeSettings[] fields of $el, return an object
// settings.unserialize(data, $el) <-- Copy properties from data to custom page settings in typeSettings[] fields of $el

function AposSnippets(options) {
  var self = this;

  // These are all provided via pushGlobalCallWhen in snippets/index.js
  self._instance = options.instance;
  self._css = options.css;
  self._typeCss = options.typeCss;
  self.manager = options.manager;

  self._action = options.action;
  // "Manage" pagination
  self._managePerPage = options.managePerPage || 20;

  // PAGE SETTINGS FOR THIS TYPE

  self.settings = {
    serialize: function($el, $details) {
      var data = { tags: apos.tagsToArray($details.find('[name="typeSettings[tags]"]').val()) };
      return data;
    },
    unserialize: function(data, $el, $details) {
      $details.find('[name="typeSettings[tags]"]').val(apos.tagsToString(data.tags));
    }
  };

  // BEGIN MANAGER FUNCTIONALITY

  if (self.manager) {

    // Make a new snippet
    $('body').on('click', '[data-new-' + self._css + ']', function() {
      self.launchNew();
      return false;
    });

    self.launchNew = function() {
      var $el = apos.modalFromTemplate('.apos-new-' + self._css, {
        save: function(callback) {
          return self.insertOrUpdate($el, 'insert', {}, callback);
        },
        init: function(callback) {
        $el.find('[name=published]').val(1);
          // TODO: these cascades mean we should have async.series browser-side.
          // Also we should provide an easier way to enable areas, and a way to
          // limit controls in areas
          return self.enableArea($el, 'body', null, function() {
            return self.enableSingleton($el, 'thumbnail', null, 'slideshow', { limit: 1, label: 'Thumbnail' }, function() {
              // Pass empty areas object to simplify logic elsewhere
              self.afterPopulatingEditor($el, { areas: {} }, callback);
            });
          });
        },
        next: function() {
          self.launchNew();
        }
      });
    };

    self.addingToManager = function($el, $snippet, snippet) {
    };

    self.afterPopulatingManager = function($el, $snippets, snippets, callback) {
      return callback();
    };

    self.afterPopulatingEditor = function($el, snippet, callback) {
      return callback();
    };

    self.beforeUpdate = function($el, data, callback) {
      return callback();
    };

    self.beforeInsert = function($el, data, callback) {
      return callback();
    };

    self.enableSingleton = function($el, name, area, type, optionsArg, callback) {
      if (typeof(optionsArg) === 'function') {
        callback = optionsArg;
        optionsArg = {};
      }
      var items = [];
      if (area && area.items) {
        items = area.items;
      }

      var options = {};
      $.extend(options, optionsArg);
      $.extend(options, {
        type: type
      });

      refreshSingleton(items, callback);

      function refreshSingleton(items, callback) {
        options.content = JSON.stringify(items);
        $.post('/apos/edit-virtual-singleton', options, function(data) {
          var $editView = $el.find('[data-' + name + '-edit-view]');
          $editView.html('');
          $editView.append(data);

          // getSingletonJSON will pick it up from here
          $editView.data('items', items);

          // If an edit takes place, refresh so we can see the new preview here
          // in the form. This isn't an issue with areas since they are always
          // in the edit state in a form. TODO: consider whether it would be
          // better to create a container that allows widgets to be rendered
          // inline, without a nested dialog box

          var $singleton = $editView.find('.apos-singleton:first');
          $singleton.bind('apos-edited', function(e, data) {
            refreshSingleton([data]);
          });

          if (callback) {
            return callback(null);
          }
        });
      }
    };

    self.enableArea = function($el, name, area, callback) {
      var items = [];
      if (area && area.items) {
        items = area.items;
      }
      $.post('/apos/edit-virtual-area', { content: JSON.stringify(items) }, function(data) {
        var $editView = $el.find('[data-' + name + '-edit-view]');
        $editView.append(data);
        return callback(null);
      });
    };

    self.getSingletonJSON = function($el, name) {
      var items = $el.find('[data-' + name + '-edit-view]').data('items');
      items = items || [];
      return JSON.stringify(items);
    };

    self.getAreaJSON = function($el, name) {
      return apos.stringifyArea($el.find('[data-' + name + '-edit-view] [data-editable]'));
    };

    self.insertOrUpdate = function($el, action, options, callback) {
      var data = {
        title: $el.find('[name="title"]').val(),
        tags: apos.tagsToArray($el.find('[name="tags"]').val()),
        slug: $el.find('[name="slug"]').val(),
        type: $el.find('[name="type"]').val(),
        thumbnail: self.getSingletonJSON($el, 'thumbnail'),
        body: self.getAreaJSON($el, 'body'),
        published: $el.find('[name=published]').val(),
        originalSlug: options.slug
      };

      if (action === 'update') {
        self.beforeUpdate($el, data, afterAction);
      } else {
        self.beforeInsert($el, data, afterAction);
      }
      // beforeSave is more convenient in most cases
      function afterAction() {
        apos.log('calling beforeSave');
        self.beforeSave($el, data, go);
      }

      function go() {
        $.ajax(
          {
            url: self._action + '/' + action,
            data: data,
            type: 'POST',
            dataType: 'json',
            success: function(data) {
              // Let anything that cares about changes to items of this kind know
              apos.change(self._css);
              return callback(null);
            },
            error: function() {
              alert('Server error');
              return callback('Server error');
            }
          }
        );
      }
    };

    self.filters = {};

    self.addFilterDefaults = function() {
      self.filters.trash = '0';
      self.filters.published = 'any';
      self.filters.q = '';
    };

    self.addFilterDefaults();

    // Manage all snippets
    $('body').on('click', '[data-manage-' + self._css + ']', function() {
      var snippets;
      var page = 1;
      var total;

      self.addFilterDefaults();

      $el = apos.modalFromTemplate('.apos-manage-' + self._css, {
        init: function(callback) {
          // We want to know if a snippet is modified
          $el.attr('data-apos-trigger-' + self._css, '');
          // Trigger an initial refresh
          triggerRefresh(callback);
        }
      });

      // Set current active choices for pill buttons

      _.each(['trash', 'published'], function(filter) {
        // TODO building selectors like this is gross we need a cleaner method
        $el.find('[data-pill][data-name="' + filter + '"] [data-choice="' + self.filters[filter] + '"]').addClass('apos-active');
      });

      // Pill buttons trigger events
      $el.on('click', '[data-pill] [data-choice]', function() {
        var $choice = $(this);
        var $pill = $choice.closest('[data-pill]');
        $pill.find('[data-choice]').removeClass('apos-active');
        $choice.addClass('apos-active');
        $el.trigger($pill.data('name'), [ $choice.attr('data-choice') ]);
      });

      // Be sure to reset to page 1 when changing the filters in any way

      $el.on('trash', function(e, choice) {
        self.filters.trash = choice;
        page = 1;
        triggerRefresh();
      });

      $el.on('published', function(e, choice) {
        self.filters.published = choice;
        page = 1;
        triggerRefresh();
      });

      function search() {
        self.filters.q = $el.find('[name=search]').val();
        page = 1;
        triggerRefresh();
        return false;
      }

      function pager() {
        // Rebuild pager based on 'page' and 'total'
        $.get('/apos/pager', { page: page, total: total }, function(data) {
          $el.find('[data-pager-box]').html(data);
        });
      }

      $el.on('keyup', '[name=search]', function(e) {
        if (e.keyCode === 13) {
          page = 1;
          search();
          return false;
        }
      });

      $el.on('click', '[data-search-submit]', function(e) {
        page = 1;
        search();
        return false;
      });

      $el.on('click', '[data-remove-search]', function() {
        self.filters.q = '';
        $el.find('[name=search]').val('');
        page = 1;
        triggerRefresh();
        return false;
      });

      $el.on('click', '[data-page]', function() {
        page = $(this).attr('data-page');
        triggerRefresh();
        return false;
      });

      // Using an event allows things like the new snippet and edit snippet dialogs to
      // tell us we should refresh our list and UI

      $el.on('apos-change-' + self._css, function(e, callback) {
        var criteria = { editable: 1, skip: (page - 1) * self._managePerPage, limit: self._managePerPage };
        $.extend(true, criteria, self.filters);

        // Make sure the filter UI reflects the filter state
        if (self.filters.trash) {
          $el.find('[data-trash]').addClass('apos-snippet-filter-active');
          $el.find('[data-live]').removeClass('apos-snippet-filter-active');
        } else {
          $el.find('[data-live]').addClass('apos-snippet-filter-active');
          $el.find('[data-trash]').removeClass('apos-snippet-filter-active');
        }

        $.getJSON(self._action + '/get', criteria, function(data) {
          snippets = data.snippets;
          // Compute total pages from total snippets
          total = Math.ceil(data.total / self._managePerPage);
          if (total < 1) {
            total = 1;
          }
          pager();
          $snippets = $el.find('[data-items]');
          $snippets.find('[data-item]:not(.apos-template)').remove();
          _.each(snippets, function(snippet) {
            var $snippet = apos.fromTemplate($snippets.find('[data-item].apos-template'));
            var $title = $snippet.find('[data-title]');
            $title.text(snippet.title);
            $title.attr('data-slug', snippet.slug);
            if (snippet.trash) {
              $title.attr('data-trash', 1);
            }
            self.addingToManager($el, $snippet, snippet);
            $snippets.append($snippet);
          });
          self.afterPopulatingManager($el, $snippets, snippets, function() {
            if (callback) {
              return callback(null);
            }
          });
        });
      });
    });

    // Edit one snippet
    $('body').on('click', '[data-edit-' + self._css + ']', function() {
      var slug = $(this).data('slug');
      if ($(this).data('trash')) {
        if (confirm('Bring this item back from the trash?')) {
          $.ajax({
            url: self._action + '/trash',
            data: { slug: slug, trash: 0 },
            type: 'POST',
            success: function() {
              triggerRefresh();
            },
            error: function() {
              alert('You do not have access or the item has been deleted.');
            }
          });
        }
        return false;
      } else {
        self.edit(slug);
        return false;
      }
    });

    self.edit = function(slug) {
      var relaunch = false;
      var active = false;
      var $el = apos.modalFromTemplate('.apos-edit-' + self._css, {
        save: save,
        init: function(callback) {
          active = true;
          $.getJSON(self._action + '/get-one', { slug: slug, editable: true }, function(data) {
            if (!data) {
              // TODO all alerts should get prettified into something nicer
              alert('That item does not exist or you do not have permission to edit it.');
              return callback('no such item');
            }
            snippet = data;

            $el.find('[name=title]').val(snippet.title);
            $el.find('[name=tags]').val(apos.tagsToString(snippet.tags));
            $el.find('[name=slug]').val(snippet.slug);

            // TODO: this boolean field prep stuff is done often enough to belong
            // in editor.js
            var published = snippet.published;
            if (published === undefined) {
              published = 1;
            } else {
              // Simple POST friendly boolean values
              published = published ? '1' : '0';
            }
            $el.find('[name=published]').val(published);

            // name=slug must always exist, at least as a hidden field, to support this
            apos.suggestSlugOnTitleEdits($el.find('[name=title]'), $el.find('[name=slug]'));

            $el.on('click', '[data-action="delete"]', function() {
              $.ajax({
                url: self._action + '/trash',
                data: { slug: slug, trash: 1 },
                type: 'POST',
                success: function() {
                  triggerRefresh();
                  $el.trigger('aposModalHide');
                },
                error: function() {
                  alert('You do not have access or the item has been deleted.');
                }
              });
              return false;
            });

            $el.on('click', '[data-action="versions"]', function() {
              aposPages.browseVersions(snippet._id);
              return false;
            });

            $el.attr('data-apos-trigger-revert', '');

            // Without this check old dialogs can rise from the dead.
            // TODO: figure out how to kill them more definitively when they are done.
            $el.on('apos-change-revert', function() {
              if (active) {
                relaunch = true;
                $el.trigger('aposModalHide');
              }
            });

            // TODO: looks like it's probably worth having the async module client side
            self.enableArea($el, 'body', snippet.areas.body, function() {
              self.enableSingleton($el, 'thumbnail', snippet.areas.thumbnail, 'slideshow', {
                limit: 1, label: 'Thumbnail' }, function() {
                self.afterPopulatingEditor($el, snippet, callback);
              });
            });
          });
        },
        afterHide: function(callback) {
          active = false;
          // Relaunch after a world-changing event like reverting the snippet
          if (relaunch) {
            self.edit(slug);
            return callback(null);
          }
        }
      });

      function save(callback) {
        return self.insertOrUpdate($el, 'update', { slug: slug }, callback);
      }
      return false;
    };

    // Import snippets
    $('body').on('click', '[data-import-' + self._css + ']', function() {
      var valid = false;
      $el = apos.modalFromTemplate('.apos-import-' + self._css, {
        init: function(callback) {
          // The file upload's completion will trigger the import operation
          $el.find('[data-action="save"]').remove();
          $el.find('[name="file"]').fileupload({
            maxNumberOfFiles: 1,
            dataType: 'json',
            start: function (e) {
              $('[data-progress]').show();
              $('[data-finished]').hide();
            },
            stop: function (e) {
              $('[data-progress]').hide();
              $('[data-finished]').show();
            },
            done: function (e, data) {
              var result = data.result;
              if (result.status === 'ok') {
                alert('Successful import. Imported ' + result.rows + ' items.');
              } else {
                alert('An error occurred during import. Imported ' + result.rows + ' items.');
              }
              $el.trigger('aposModalHide');
            }
          });
          return callback(null);
        }
      });
    });
  }
  function triggerRefresh(callback) {
    $el.trigger('apos-change-' + self._css, callback);
  }
  // END MANAGER FUNCTIONALITY
}

// GUIDE TO USE
//
// Call AposSnippets.addWidgetType() from your site.js to add this widget type, allowing
// snippets to be inserted into areas on the site.
//
// Call AposSnippets.addWidgetType({ ... }) with different name, label, action and
// defaultLimit options to provide a snippet widget for a different instance type
// that otherwise behaves like the normal snippet widget.
//
// If these options are not enough, you can override methods of apos.widgetTypes[yourName]
// as needed after this call.

AposSnippets.addWidgetType = function(options) {
  options = options || {};
  // _class contains properties common to all instances of the widget
  // Having this here is redundant and we need to figure out how to kill it
  var _class = {
    name: options.name || 'snippets',
    label: options.label || 'Snippets',
    action: options.action || '/apos-snippets',
    defaultLimit: options.defaultLimit || 1
  };

  apos.widgetTypes[_class.name] = {
    // For the rich content editor's menu
    label: _class.label,

    // Constructor
    editor: function(options) {
      var self = this;
      self._class = _class;

      self.action = self._class.action;
      self.defaultLimit = options.limit || self._class.defaultLimit;
      if (!options.messages) {
        options.messages = {};
      }
      if (!options.messages.missing) {
        options.messages.missing = 'Pick at least one.';
      }

      self.afterCreatingEl = function() {
        if (self.data.limit === undefined) {
          self.data.limit = self.defaultLimit;
        }
        self.$by = self.$el.find('[name="by"]');
        self.$by.radio(self.data.by || 'id');
        self.$tags = self.$el.find('[name="tags"]');
        self.$tags.val(apos.tagsToString(self.data.tags));
        self.$limit = self.$el.find('[name="limit"]');
        self.$limit.val(self.data.limit);
        self.$ids = self.$el.find('[data-ids]');
        // Get the titles corresponding to the existing list of idss.
        //
        // We're going to get a prePreview call before this
        // completes. Set a flag to indicate we're not done yet.
        //
        // prePreview will call debrief, which spots this flag and
        // sets pendingCallback rather than calling back directly.
        // We can then invoke pendingCallback here when we're
        // good and ready.
        //
        // This would be easier if afterCreatingEl took a callback.
        // TODO: refactor afterCreatingEl for all widgets.

        self.pending = true;

        // TODO: use of GET with a list of IDs is bad, use POST and
        // make sure the routes accept POST
        $.getJSON(self.action + '/autocomplete', { ids: self.data.ids || []}, function(data) {
          self.pending = false;
          self.$ids.selective({
            data: data,
            source: self.action + '/autocomplete',
            sortable: true
          });
          if (self.pendingCallback) {
            return self.pendingCallback();
          }
        });
      };

      self.debrief = function(callback) {
        self.data.by = self.$by.radio();
        self.data.tags = apos.tagsToArray(self.$tags.val());
        self.data.limit = parseInt(self.$limit.val(), 10);
        if (self.pending) {
          self.pendingCallback = whenReady;
          return;
        } else {
          return whenReady();
        }
        function whenReady() {
          self.data.ids = self.$ids.selective('get');
          // Don't force them to pick something, it's common to want to go back
          // to an empty singleton
          self.exists = true;
          return callback();
        }
      };

      self.type = options.type || self._class.name;
      self.css = apos.cssName(self.type);
      options.template = '.apos-' + self.css + '-widget-editor';

      self.prePreview = self.debrief;
      self.preSave = self.debrief;

      // Parent class constructor shared by all widget editors
      apos.widgetEditor.call(self, options);
    }
  };
};

