apos.widgetTypes.snippets = {
  label: 'Snippets',
  editor: function(options) {
    var self = this;

    if (!options.messages) {
      options.messages = {};
    }
    if (!options.messages.missing) {
      options.messages.missing = 'Pick at least one.';
    }

    self.afterCreatingEl = function() {
      self.$by = self.$el.find('[name="by"]');
      self.$by.val(self.data.by);
      self.$tags = self.$el.find('[name="tags"]');
      self.$tags.val(apos.tagsToString(self.data.tags));
      self.$limit = self.$el.find('[name="limit"]');
      self.$limit.val(self.data.limit);
      self.$ids = self.$el.find('[data-ids]');
      self.populate();
      self.$title = self.$el.find('[name="title"]');
      self.$add = self.$el.find('[name="add"]');

      self.$el.on('click', '[name="add"]', function() {

        return false;
      });
    };

    self.populate = function() {
      self.$ids.find('.apos-snippets-id:not(.apos-template)').remove();
      _.each(self.data.ids, function(id) {
        self.add(id);
      });
    };

    self.add = function(id) {
      var $item = apos.fromTemplate('.apos-snippets-id');
      $item.attr('data-snippet-id', id.id);
      $item.text(id.title);
      self.$ids.append($item);
    };

    self.type = 'snippets';
    options.template = '.apos-snippets-editor';

    self.prePreview = self.debrief;
    self.preSave = self.debrief;

    // Parent class constructor shared by all widget editors
    apos.widgetEditor.call(self, options);

    self.sanitize = function() {
      self.data.by = self.$by.val();
      self.data.tags = apos.tagsToArray(self.$tags.val());
      self.data.limit = parseInt(self.limit.val(), 10);
      self.data.ids = _.map(self.$ids.find('[data-id]:not(.apos-template)'), function(el) {
        return $(el).data('snippetId');
      });
    };
  }
};

