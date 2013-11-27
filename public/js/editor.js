// JavaScript which enables editing of this module's content belongs here.

// See this module's README for more information about subclassing snippets.

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
  self.schema = options.schema;

  // PAGE SETTINGS FOR THIS TYPE

  self.settings = {
    serialize: function($el, $details) {
      var data = {
        tags: $details.find('[data-name="tags"]').selective('get'),
        notTags: $details.find('[data-name="notTags"]').selective('get')
      };
      return data;
    },
    unserialize: function(data, $el, $details) {
      apos.enableTags($details.find('[data-name="tags"]'), data.tags);
      apos.enableTags($details.find('[data-name="notTags"]'), data.notTags);
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
          return self.validate($el, 'insert', function(err) {
            if (err) {
              return callback(err);
            }
            return self.insertOrUpdate($el, 'insert', {}, callback);
          });
        },
        init: function(callback) {
          var defaultSnippet = self.getDefaultSnippet();
          return self.populateEditor($el, defaultSnippet, callback);
        },
        next: function() {
          self.launchNew();
        }
      });
      if (!$el.length) {
        apos.log('ERROR: there is no template with the apos-new' + self._css + ' class. You probably need to copy and edit new.html and edit.html for your snippet subclass.');
      }
    };

    // Populate the editor's fields and invoke the afterPopulatingEditor callback
    // for easy extension by those not relying on the schema
    self.populateEditor = function($el, snippet, callback) {
      self.populateFields($el, snippet, function() {
        return self.afterPopulatingEditor($el, snippet, callback);
      });
    };

    // Populate all fields specified in the schema and also any custom fields implemented
    // directly. Used for "new" and "edit"
    self.populateFields = function($el, snippet, callback) {
      return self.populateSomeFields($el, self.schema, snippet, callback);
    };

    self.getDefaultSnippet = function() {
      var def = {
        areas: {}
      };
      _.each(self.schema, function(field) {
        if (field.def !== undefined) {
          def[field.name] = field.def;
        }
      });
      return def;
    };

    // Populate form elements corresponding to a set of fields as specified in a schema
    // (the schema argument). The inverse of self.convertSomeFields
    self.populateSomeFields = function($el, schema, snippet, callback) {
      // This is a workaround for the lack of async.each client side.
      // Think about bringing that into the browser.
      function populateField(i) {
        if (i >= schema.length) {
          return callback(null);
        }
        var field = schema[i];
        // Not all displayers use this
        var $field = $el.findByName(field.name);
        return self.displayers[field.type](snippet, field.name, $field, $el, field, function() {
          return populateField(i + 1);
        });
      }
      return populateField(0);
    };

    // Gather data from form elements and push it into properties of the data object,
    // as specified by the schema provided. The inverse of self.populateSomeFields
    self.convertSomeFields = function($el, schema, data, callback) {
      _.each(schema, function(field) {
        // This won't be enough for every type of field, so we pass $el too
        var $field = $el.findByName(field.name);
        if (!$field.length) {
          $field = $el.findByName(field.legacy);
        }
        self.converters[field.type](data, field.name, $field, $el, field);
      });
      return callback(null);
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

    self.beforeSave = function($el, data, callback) {
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
          $singleton.on('aposEdited', function(e, data) {
            refreshSingleton([data], function() {
              // A change event on the singleton's wrapper signifies
              // that getSingletonItem and getSingletonJSON can now be
              // called to see the new data
              $el.find('[data-name="' + name + '"]').trigger('change');
            });
          });

          if (callback) {
            return callback(null);
          }
        });
      }
    };

    // options argument may be skipped
    self.enableArea = function($el, name, area, options, callback) {
      if (!callback) {
        callback = options;
        options = {};
      }
      var items = [];
      if (area && area.items) {
        items = area.items;
      }
      $.post('/apos/edit-virtual-area', { content: JSON.stringify(items), options: JSON.stringify(options) }, function(data) {
        var $editView = $el.find('[data-' + name + '-edit-view]');
        $editView.append(data);
        return callback(null);
      });
    };

    // Access the widget data for a particular singleton
    self.getSingletonItem = function($el, name) {
      var items = $el.find('[data-' + name + '-edit-view]').data('items');
      items = items || [];
      return items[0];
    };

    // Retrieve a JSON string to serialize the singleton
    self.getSingletonJSON = function($el, name) {
      var items = $el.find('[data-' + name + '-edit-view]').data('items');
      items = items || [];
      return JSON.stringify(items);
    };

    // Retrieve a JSON string to serialize the area
    self.getAreaJSON = function($el, name) {
      var $property = $el.find('[data-' + name + '-edit-view]');
      // Supports both "alwaysEditing" editors like apostrophe-editor-2
      // and classic editors that don't use an apos-area wrapper when
      // editing virtual areas in a snippet
      var $editor = $property.find('.apos-editor:first');
      if ($editor.length) {
        return apos.stringifyArea($editor);
      } else {
        return apos.stringifyArea($property.find('.apos-area:first'));
      }
    };

    // Methods to convert from a form field of each schema type
    // to a property of the snippet ready to save. The server does
    // all the validation of course, since you can't trust a browser
    // anyway, so this is mostly simple except where the representation
    // in the form differs greatly from the representation the server wants
    self.converters = {
      // Convert the tough cases
      area: function(data, name, $field, $el, field) {
        data[name] = self.getAreaJSON($el, name);
      },
      singleton: function(data, name, $field, $el, field) {
        data[name] = self.getSingletonJSON($el, name);
      },
      joinByOne: function(data, name, $field, $el, field) {
        // Fix $field since we can't use the regular name attribute here
        $field = $el.find('[data-name="' + name + '"]');
        // The server will do the work of moving it to the idField as needed
        data[name] = $field.selective('get')[0];
      },
      joinByOneReverse: function(data, name, $field, $el, field) {
        // Not edited on this side of the relation
      },
      joinByArray: function(data, name, $field, $el, field) {
        // Fix $field since we can't use the regular name attribute here
        $field = $el.find('[data-name="' + name + '"]');
        // The server will do the work of processing it all into
        // the relationshipsField and idsField separately for us if needed
        data[name] = $field.selective('get');
      },
      joinByArrayReverse: function(data, name, $field, $el, field) {
        // Not edited on this side of the relation
      },

      // The rest are very simple because the server does
      // the serious sanitization work and the representation in the DOM
      // is a simple form element
      string: function(data, name, $field, $el, field) {
        data[name] = $field.val();
      },
      password: function(data, name, $field, $el, field) {
        data[name] = $field.val();
      },
      slug: function(data, name, $field, $el, field) {
        data[name] = $field.val();
      },
      tags: function(data, name, $field, $el, field) {
        data[name] = $el.find('[data-name="' + name + '"]').selective('get');
      },
      boolean: function(data, name, $field, $el, field) {
        data[name] = $field.val();
      },
      select: function(data, name, $field, $el, field) {
        data[name] = $field.val();
      },
      integer: function(data, name, $field, $el, field) {
        data[name] = $field.val();
      },
      float: function(data, name, $field, $el, field) {
        data[name] = $field.val();
      },
      url: function(data, name, $field, $el, field) {
        data[name] = $field.val();
      },
      date: function(data, name, $field, $el, field) {
        data[name] = $field.val();
      },
      time: function(data, name, $field, $el, field) {
        data[name] = $field.val();
      },
    };

    // Methods to display all of the field types supported by the schema
    self.displayers = {
      area: function(data, name, $field, $el, field, callback) {
        return self.enableArea($el, name, data.areas ? data.areas[name] : null, field.options || {}, callback);
      },
      singleton: function(data, name, $field, $el, field, callback) {
        return self.enableSingleton($el, name, data.areas ? data.areas[name] : null, field.widgetType, field.options || {}, callback);
      },
      string: function(data, name, $field, $el, field, callback) {
        $field.val(data[name]);
        return callback();
      },
      password: function(data, name, $field, $el, field, callback) {
        $field.val(data[name]);
        return callback();
      },
      slug: function(data, name, $field, $el, field, callback) {
        $field.val(data[name]);
        return callback();
      },
      tags: function(data, name, $field, $el, field, callback) {
        apos.enableTags($el.find('[data-name="' + name + '"]'), data[name]);
        return callback();
      },
      url: function(data, name, $field, $el, field, callback) {
        $field.val(data[name]);
        return callback();
      },
      select: function(data, name, $field, $el, field, callback) {
        var $options = $field.find('option');
        // Synthesize options from the choices in the schema, unless
        // the frontend developer has chosen to do it for us
        if (!$options.length) {
          _.each(field.choices, function(choice) {
            var $option = $('<option></option>');
            $option.text(choice.label);
            $option.attr('value', choice.value);
            $field.append($option);
          });
        }
        if ((!data._id) && field.def) {
          $field.val(field.def);
        } else {
          $field.val(data[name]);
        }
        return callback();
      },
      integer: function(data, name, $field, $el, field, callback) {
        $field.val(data[name]);
        return callback();
      },
      float: function(data, name, $field, $el, field, callback) {
        $field.val(data[name]);
        return callback();
      },
      boolean: function(data, name, $field, $el, field, callback) {
        $field.val(data[name] ? '1' : '0');
        return callback();
      },
      joinByOne: function(data, name, $field, $el, field, callback) {
        // Since we can't use a regular name attribute for a div
        $field = $el.find('[data-name="' + name + '"]');
        if (!$field.length) {
          apos.log('Error: your new.html template for the ' + self.name + ' module does not have a snippetSelective call for the ' + name + ' join yet');
        }
        var selectiveData = [];
        var id = data[field.idField];
        if (id) {
          // Let jQuery selective call back for the details
          selectiveData.push(id);
        }
        $field.selective({ limit: 1, data: selectiveData, source: aposPages.getManager(field.withType)._action + '/autocomplete' });
        return callback();
      },
      joinByOneReverse: function(data, name, $field, $el, field, callback) {
        // Not edited on the reverse side
        return callback();
      },
      joinByArray: function(data, name, $field, $el, field, callback) {
        // Since we can't use a regular name attribute for a div
        $field = $el.find('[data-name="' + name + '"]');
        if (!$field.length) {
          apos.log('Error: your new.html template for the ' + self.name + ' module does not have a snippetSelective call for the ' + name + ' join yet');
        }
        var selectiveData = [];
        _.each(data[field.name] || [], function(friend) {
          var datum = {};
          if (field.relationshipsField) {
            $.extend(true, datum, friend.relationship);
            // Fix booleans to match the select element's options
            _.each(field.relationship, function(relField) {
              if (relField.type === 'boolean') {
                datum[relField.name] = datum[relField.name] ? '1' : '0';
              }
            });
            // Present these as jQuery Selective expects us to
            datum.label = friend.item.title;
            datum.value = friend.item._id;
          } else {
            datum.label = friend.title;
            datum.value = friend._id;
          }
          selectiveData.push(datum);
        });
        $field.selective({ preventDuplicates: true, sortable: field.sortable, extras: !!field.relationship, data: selectiveData, source: aposPages.getManager(field.withType)._action + '/autocomplete' });
        return callback();
      },
      joinByArrayReverse: function(data, name, $field, $el, field, callback) {
        // Not edited on the reverse side
        return callback();
      },
      date: function(data, name, $field, $el, field, callback) {
        $field.val(data[name]);
        apos.enhanceDate($field);
        if (field.legacy) {
          apos.enhanceDate($el.findByName(field.legacy));
        }
        return callback();
      },
      time: function(data, name, $field, $el, field, callback) {
        if (data[name] && data[name].length) {
          // Revert to local time for editing
          $field.val(apos.formatTime(data[name]));
        }
        return callback();
      },
    };

    self.insertOrUpdate = function($el, action, options, callback) {
      var data = {
        type: $el.find('[name="type"]').val(),
        originalSlug: options.slug
      };

      self.convertSomeFields($el, self.schema, data, function() {
        if (action === 'update') {
          self.beforeUpdate($el, data, afterAction);
        } else {
          self.beforeInsert($el, data, afterAction);
        }
        // beforeSave is more convenient in most cases
        function afterAction() {
          self.beforeSave($el, data, go);
        }
      });

      function go() {
        $.ajax(
          {
            url: self._action + '/' + action,
            data: data,
            type: 'POST',
            dataType: 'json',
            success: function(data) {
              // Let anything that cares about changes to items of this kind know
              apos.change(self.name);
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

    self.filterDefaults = {
      trash: '0',
      published: 'any',
      q: ''
    };

    self.filters = {};
    $.extend(true, self.filters, self.filterDefaults);

    // Manage all snippets
    $('body').on('click', '[data-manage-' + self._css + ']', function() {
      var snippets;
      var page = 1;
      var total;

      // Reset filters
      $.extend(true, self.filters, self.filterDefaults);

      $el = apos.modalFromTemplate('.apos-manage-' + self._css, {
        init: function(callback) {
          // We want to know if a snippet is modified
          $el.attr('data-apos-trigger-' + apos.eventName(self.name), '');
          // Trigger an initial refresh
          triggerRefresh(callback);
        }
      });

      // Set current active choices for pill buttons

      $el.find('[data-pill] [data-choice]').removeClass('apos-active');
      _.each(self.filters, function(value, filter) {
        $el.find('[data-pill][data-name="' + filter + '"] [data-choice="' + value + '"]').addClass('apos-active');
      });

      // Filter clicks
      $el.on('click', '[data-pill] [data-choice]', function() {
        var $choice = $(this);
        var $pill = $choice.closest('[data-pill]');
        $pill.find('[data-choice]').removeClass('apos-active');
        $choice.addClass('apos-active');
        self.filters[$pill.data('name')] = $choice.attr('data-choice');
        page = 1;
        triggerRefresh();
        return false;
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

      $el.on(apos.eventName('aposChange', self.name), function(e, callback) {
        var criteria = { editable: 1, skip: (page - 1) * self._managePerPage, limit: self._managePerPage };
        $.extend(true, criteria, self.filters);

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
            $title.text(snippet.title || '[NO TITLE]');
            $title.attr('data-slug', snippet.slug);
            if (snippet.trash) {
              $title.attr('data-trash', 1);
            }
            if (snippet.tags !== null) {
              $snippet.find('[data-tags]').text(snippet.tags);
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
          if (!$el.length) {
            apos.log('ERROR: there is no template with the apos-edit-' + self._css + ' class. You probably need to copy and edit new.html and edit.html for your snippet subclass.');
          }
          $.getJSON(self._action + '/get-one', { slug: slug, editable: true }, function(data) {
            if (!data) {
              // TODO all alerts should get prettified into something nicer
              alert('That item does not exist or you do not have permission to edit it.');
              return callback('no such item');
            }
            snippet = data;

            // name=slug must always exist, at least as a hidden field, to support this
            var $title = $el.find('[name=title]');
            var $slug = $el.find('[name=slug]');
            if ($slug.length) {
              apos.suggestSlugOnTitleEdits($title, $slug);
            }

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
            $el.on('aposChangeRevert', function() {
              if (active) {
                relaunch = true;
                $el.trigger('aposModalHide');
              }
            });

            return self.populateEditor($el, snippet, callback);
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
        return self.validate($el, 'update', function(err) {
          if (err) {
            return callback(err);
          }
          return self.insertOrUpdate($el, 'update', { slug: slug }, callback);
        });
      }
      return false;
    };

    // You may optionally override this method to validate the form. Inspect the fields
    // of $el and, if you consider them unacceptable, invoke callback with anything other
    // than null to block the saving of the form and continue editing. There is a strong
    // bias toward sanitizing the user's input rather than blocking them in this way, but
    // in some applications it is worthwhile.
    //
    // `action` will be either `insert` or `update`. If the distinction between a new
    // item and an updated one is irrelevant to your validation you may ignore it.

    self.validate = function($el, action, callback) {
      return callback(null);
    };

    // Import snippets
    $('body').on('click', '[data-import-' + self._css + ']', function() {
      var valid = false;
      $el = apos.modalFromTemplate('.apos-import-' + self._css, {
        init: function(callback) {
          // The file upload's completion will trigger the import operation
          $el.find('[name="file"]').attr('data-url', self._action + '/import');
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
    $el.trigger(apos.eventName('aposChange', self.name), callback);
  }
  // END MANAGER FUNCTIONALITY
}

// TODO: this is terrifically dumb. Figure out how to make this a regular method of the
// manager object you just constructed. Also figure out how to participate in
// apos.addWidgetType() normally.

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

      self.type = options.type || self._class.name;
      self.css = apos.cssName(self.type);
      options.template = '.apos-' + self.css + '-widget-editor';

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
        self.$tags = self.$el.find('[data-name="tags"]');
        apos.enableTags(self.$tags, self.data.tags);
        self.$limit = self.$el.find('[name="limit"]');
        self.$limit.val(self.data.limit);
        self.$ids = self.$el.find('[data-name="ids"]');
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
        $.getJSON(self.action + '/autocomplete', { values: self.data.ids || []}, function(data) {
          self.pending = false;
          self.$ids.selective({
            data: data,
            source: self.action + '/autocomplete',
            sortable: true,
            limit: options.options.limit
          });
          if (self.pendingCallback) {
            return self.pendingCallback();
          }
        });
      };

      // Parent class constructor shared by all widget editors
      AposWidgetEditor.call(self, options);

      self.debrief = function(callback) {
        self.data.by = self.$by.radio();
        self.data.tags = self.$tags.selective('get');
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

      self.prePreview = self.debrief;
      self.preSave = self.debrief;
    }
  };
};

// When we explicitly subclass snippets, there must also be a subclass on the browser
// side. However sometimes this subclass really has no unique work to do, so we can
// synthesize it automatically. Do so if no constructor for it is found. Also wire up
// the widget constructor here if it has not been done explicitly.
//
// A call to this method is pushed to the browser by apostrophe-snippets/index.js

AposSnippets.subclassIfNeeded = function(constructorName, baseConstructorName, options) {
  if (!window[constructorName]) {
    window[constructorName] = function(options) {
      var self = this;
      window[baseConstructorName].call(self, options);
    };
  }

  if (!window[constructorName].addWidgetType) {
    window[constructorName].addWidgetType = function(optionsArg) {
      _.defaults(optionsArg, options.widget || {});
      window[baseConstructorName].addWidgetType(options);
    };
  }
};

