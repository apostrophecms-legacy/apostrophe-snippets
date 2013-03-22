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
  var _class = {
    name: options.name || 'snippets',
    label: options.label || 'Snippets',
    action: options.action || '/apos-snippet',
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
        apos.log('self.$limit length is ' + self.$limit.length);
        self.$ids = self.$el.find('[data-ids]');
        apos.log('self.$ids length is ' + self.$ids.length);
        self.populate();
        self.$title = self.$el.find('[name="title"]');
        self.$title.autocomplete({
          minLength: 1,
          source: self.action + '/autocomplete',
          focus: function(event, ui) {
            apos.log('focus');
            self.$title.val(ui.item.title);
            return false;
          },
          select: function(event, ui) {
            apos.log('select');
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
        $.getJSON(options.action + '/autocomplete', { ids: self.data.ids }, function(data) {
          _.each(data, function(info) {
            self.add(info);
          });
        });
      };

      self.add = function(id) {
        var $item = apos.fromTemplate(self.$ids.find('[data-id].apos-template'));
        apos.log($item.length);
        $item.attr('data-snippet-id', id.id);
        $item.find('[data-title]').text(id.value);
        self.$ids.append($item);
        apos.log("appended:");
        apos.log($item[0]);
      };

      self.debrief = function(callback) {
        self.data.by = apos.getRadio(self.$by);
        self.data.tags = apos.tagsToArray(self.$tags.val());
        self.data.limit = parseInt(self.$limit.val(), 10);
        self.data.ids = _.map(self.$ids.find('[data-id]:not(.apos-template)'), function(el) {
          return $(el).data('snippetId');
        });
        self.exists = !!self.data.ids.length;
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

