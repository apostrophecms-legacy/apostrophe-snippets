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
        apos.setRadio(self.$by, self.data.by || 'id');
        self.$tags = self.$el.find('[name="tags"]');
        self.$tags.val(apos.tagsToString(self.data.tags));
        self.$limit = self.$el.find('[name="limit"]');
        self.$limit.val(self.data.limit);
        self.$ids = self.$el.find('[data-ids]');
        self.populate();
        self.$title = self.$el.find('[name="title"]');
        self.$title.autocomplete({
          minLength: 1,
          source: self.action + '/autocomplete',
          focus: function(event, ui) {
            self.$title.val(ui.item.title);
            return false;
          },
          select: function(event, ui) {
            self.$title.val('');
            self.add(ui.item);
            return false;
          }
        });

        self.$ids.sortable();

        self.$ids.on('click', '.apos-remove', function() {
          $(this).closest('[data-id]').remove();
          return false;
        });
      };

      self.populate = function() {
        self.$ids.find('[data-id]:not(.apos-template)').remove();
        // We've got just the actual ids, we need the titles also in
        // jquery autocomplete format. The autocomplete route accepts
        // an ids option for this purpose, since it is already set up to
        // transmit results in the needed format
        $.getJSON(self.action + '/autocomplete', { ids: self.data.ids }, function(data) {
          _.each(data, function(info) {
            self.add(info);
          });
        });
      };

      self.add = function(id) {
        var $item = apos.fromTemplate(self.$ids.find('[data-id].apos-template'));
        $item.attr('data-snippet-id', id.id);
        $item.find('[data-title]').text(id.value);
        self.$ids.append($item);
      };

      self.debrief = function(callback) {
        self.data.by = apos.getRadio(self.$by);
        self.data.tags = apos.tagsToArray(self.$tags.val());
        self.data.limit = parseInt(self.$limit.val(), 10);
        self.data.ids = _.map(self.$ids.find('[data-id]:not(.apos-template)'), function(el) {
          return $(el).data('snippetId');
        });
        // Don't force them to pick something, it's common to want to go back
        // to an empty singleton
        self.exists = true;
        return callback();
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

