var _ = require('underscore');
var async = require('async');

module.exports = widget;

function widget(options) {
  return new widget.Widget(options);
}

widget.Widget = function(options) {
  var self = this;
  self.apos = options.apos;
  self.snippets = options.snippets;
  self.app = options.app;
  self.icon = options.icon;

  self.name = options.name || 'snippets';
  self.label = options.label || 'Snippets';

  // One asset folder for the whole snippets module is fine
  self.pushAsset = function(type, name, options) {
    self.snippets.pushAsset(type, name, options);
  };

  // This widget should be part of the default set of widgets for areas
  // (note devs can still override the list)
  self.apos.defaultControls.push(self.name);

  // Include our editor template in the markup when aposTemplates is called
  self.pushAsset('template', 'widgetEditor', { when: 'user' });

  // So far we've always kept this in the same file with the rest of the module's CSS,
  // so don't clutter up the console with 404s in dev
  // self.pushAsset('stylesheet', 'widget');

  self.addCriteria = function(item, criteria, options) {
    if ((item.by === 'tag') && (item.tags)) {
      if (item.tags.length) {
        criteria.tags = { $in: item.tags };
      }
      if (item.limit) {
        options.limit = item.limit;
      } else {
        // Always set an upper limit
        options.limit = 1000;
      }
    } else if ((item.by === 'id') && (item.ids)) {
      // Specific IDs were selected, do not look at the limit
      criteria._id = { $in: item.ids };
    }
  };

  self.apos.itemTypes[self.name] = {
    widget: true,
    label: self.label,
    css: self.apos.cssName(self.name),
    icon: self.icon,
    sanitize: function(item) {
      item.by += '';
      item.tags = self.apos.sanitizeTags(item.tags);
      if (!Array.isArray(item.ids)) {
        item.ids = [];
      }
      item.ids = _.map(item.ids, function(id) {
        // Must be string
        id = self.apos.sanitizeString(id);
        return id;
      });
      item.limit = self.apos.sanitizeInteger(item.limit, 5, 1, 1000);
    },

    render: function(data) {
      return self.snippets.render('widget', data);
    },

    // Asynchronously load the content of the snippets we're reusing.
    // The properties you add should start with an _ to denote that
    // they shouldn't become data attributes or get stored back to MongoDB

    load: function(req, item, callback) {
      var criteria = {};
      var options = {};

      self.addCriteria(item, criteria, options);
      self.snippets.get(req, criteria, options, function(err, results) {
        if (err) {
          item._snippets = [];
          console.log(err);
          return callback(err);
        }
        var snippets = results.snippets;
        if (item.by === 'id') {
          snippets = self.apos.orderById(item.ids, snippets);
          // Put them in the same order as the ids that were manually selected
          // (you can't do this with mongodb sort, so we do it here)
          var snippetsById = {};
          _.each(snippets, function(snippet) {
            snippetsById[snippet._id] = snippet;
          });
          snippets = [];
          _.each(item.ids, function(id) {
            // Careful, we must politely ignore ids that don't exist anymore
            if (snippetsById.hasOwnProperty(id)) {
              snippets.push(snippetsById[id]);
            }
          });
        }
        self.snippets.addUrls(req, snippets, send);
        function send(err) {
          item._snippets = snippets;
          return callback(null);
        }
      });
    },

    empty: function(item) {
      return (!item._snippets) || (!item._snippets.length);
    }
  };
};

