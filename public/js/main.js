// NOTES FOR REUSE:
//
// If your custom "subclass" of snippets has a distinct setting for the instance option
// on the server side, you must pass that option on the browser side as well.
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

function AposSnippets(optionsArg) {
  var self = this;
  var options = {
    instance: 'snippet'
  };
  $.extend(options, optionsArg);
  self._instance = options.instance;
  self._css = apos.cssName(self._instance);
  apos.log("Setting up for " + self._instance);
  self._action = '/apos-' + self._css;
  self._pages = options.pages;

  self.settings = {
    serialize: function($el, $details) {
      apos.log('serialize called');
      var data = { tags: apos.tagsToArray($details.find('[name="typeSettings[tags]"]').val()) };
      return data;
    },
    unserialize: function(data, $el, $details) {
      apos.log('unserialize called');
      $details.find('[name="typeSettings[tags]"]').val(apos.tagsToString(data.tags));
    }
  };

  // Make a new snippet
  $('body').on('click', '[data-new-' + self._css + ']', function() {
    var $el = apos.modalFromTemplate('.apos-new-' + self._css, {
      save: function(callback) {
        return self.insertOrUpdate($el, 'insert', {}, callback);
      },
      init: function(callback) {
        return self.enableArea($el, [], function() {
          self.afterPopulatingEditor($el, {}, callback);
        });
      }
    });
    return false;
  });

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

  self.enableArea = function($el, content, callback) {
    $.post('/apos/edit-virtual-area', { content: JSON.stringify(content) }, function(data) {
        var editView = $el.find('[data-body-edit-view]');
        editView.append(data);
        return callback(null);
      }
    );
  };

  self.insertOrUpdate = function($el, action, options, callback) {
    var data = {
      title: $el.find('[name="title"]').val(),
      tags: apos.tagsToArray($el.find('[name="tags"]').val()),
      slug: $el.find('[name="slug"]').val(),
      type: $el.find('[name="type"]').val(),
      content: apos.stringifyArea($el.find('[data-editable]')),
      originalSlug: options.slug
    };

    if (action === 'update') {
      self.beforeUpdate($el, data, go);
    } else {
      self.beforeInsert($el, data, go);
    }

    function go() {
      $.ajax(
        {
          url: self._action + '/insert',
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

  // Manage all snippets
  apos.log('configuring click for ' + '[data-manage-' + self._css + ']');
  apos.log('length is: ' + $('[data-manage-' + self._css + ']').length);
  $('body').on('click', '[data-manage-' + self._css + ']', function() {
    var snippets;
    apos.log('manage clicked for ' + self._css);
    $el = apos.modalFromTemplate('.apos-manage-' + self._css, {
      init: function(callback) {
        // We want to know if a snippet is modified
        $el.attr('data-apos-trigger-' + self._css, '');
        // Trigger an initial refresh
        $el.trigger('apos-change-' + self._css, callback);
      }
    });

    // Allows things like the new snippet and edit snippet dialogs to
    // tell us we should refresh our list

    $el.on('apos-change-' + self._css, function(e, callback) {
      $.getJSON(self._action + '/get', { editable: true }, function(data) {
        snippets = data;
        $snippets = $el.find('[data-items]');
        $snippets.find('[data-item]:not(.apos-template)').remove();
        _.each(snippets, function(snippet) {
          var $snippet = apos.fromTemplate($snippets.find('[data-item].apos-template'));
          var $title = $snippet.find('[data-title]');
          $title.text(snippet.title);
          $title.attr('data-slug', snippet.slug);
          self.addingToManager($snippet, snippet);
          $snippets.append($snippet);
        });
        self.afterPopulatingManager($el, $snippets, snippets, function() {
          if (callback) {
            apos.log('calling back after populating manager');
            apos.log('$snippets.length is ' + $snippets.length);
            apos.log('Inserted snippets: ' + $el.find('[data-item]:not(.apos-template)').length);
            return callback(null);
          } else {
            apos.log('enh no callback');
          }
        });
      });
    });
  });

  // Edit one snippet
  $('body').on('click', '[data-edit-' + self._css + ']', function() {
    var slug = $(this).data('slug');
    var snippet;
    var $el = apos.modalFromTemplate('.apos-edit-' + self._css, {
      save: save,
      init: function(callback) {
        $.getJSON(self._action + '/get', { slug: slug, editable: true }, function(data) {
          if ((!data) || (!data.length)) {
            // TODO all alerts should get prettified into something nicer
            alert('That item does not exist or you do not have permission to edit it.');
            return callback('no such item');
          }
          snippet = data.pop();
          apos.log(snippet);

          $el.find('[name=title]').val(snippet.title);
          $el.find('[name=tags]').val(apos.tagsToString(snippet.tags));
          $el.find('[name=slug]').val(snippet.slug);

          apos.log('BEFORE suggest slug');
          apos.log($el[0]);
          // name=slug must always exist, at least as a hidden field, to support this
          apos.suggestSlugOnTitleEdits($el.find('[name=title]'), $el.find('[name=slug]'));

          $el.on('click', '[data-action="delete"]', function() {
            // TODO this should obviously be a pretty confirmation dialog
            // with a type specific, internationalizable message
            if (confirm('Are you sure you want to delete this permanently and forever?')) {
              $.post(self._action + '/delete', { slug: slug }, function(data) {
                apos.change(self._css);
                $el.trigger('aposModalHide');
              }, 'json');
            }
            return false;
          });

          self.enableArea($el, snippet.areas.body ? snippet.areas.body.items : [], function() {
            self.afterPopulatingEditor($el, snippet, callback);
          });
        });
      }
    });

    function save(callback) {
      return self.insertOrUpdate($el, 'update', { slug: slug }, callback);
    }
    return false;
  });
}
