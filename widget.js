var _ = require('underscore');

module.exports = widget;

function widget(options) {
  return new widget.Widget(options);
}

widget.Widget = function(options) {
  var apos = options.apos;
  var snippets = options.snippets;
  var app = options.app;
  var self = this;

  self.name = options.name || 'snippets';
  self.label = options.label || 'Snippets';

  // One asset folder for the whole snippets module is fine
  self.pushAsset = function(type, name) {
    console.log('hmm.');
    console.log(snippets._dirs);
    console.log(name);
    snippets.pushAsset(type, name);
  };

  // This widget should be part of the default set of widgets for areas
  // (note devs can still override the list)
  apos.defaultControls.push(self.name);

  // Include our editor template in the markup when aposTemplates is called
  self.pushAsset('template', 'widgetEditor');

  // Make sure that aposScripts and aposStylesheets summon our assets

  self.pushAsset('script', 'widget');
  self.pushAsset('stylesheet', 'widget');

  apos.itemTypes[self.name] = {
    widget: true,
    label: self.label,
    css: apos.cssName(self.name),

    sanitize: function(item) {
      item.by += '';
      item.tags = apos.sanitizeTags(item.tags);
      if (!Array.isArray(item.ids)) {
        item.ids = [];
      }
      item.ids = _.map(item.ids, function(id) {
        // Must be string
        id += '';
        return id;
      });
    },

    render: function(data) {
      console.log('rendering the widget');
      return snippets.render('widget', data);
    },

    // Asynchronously load the content of the snippets we're reusing.
    // The properties you add should start with an _ to denote that
    // they shouldn't become data attributes or get stored back to MongoDB

    load: function(item, callback) {
      var criteria = {};
      if ((item.by === 'tag') && (item.tags)) {
        if (item.tags.length) {
          criteria.tags = { $in: item.tags };
        }
      } else if ((item.by === 'id') && (item.ids)) {
        criteria._id = { $in: item.ids };
      }

      // TODO: we don't have a real req object at this point. Passing a
      // stub means we'll get only fully published, publicly visible snippets.
      // Think about how to get user identity into loaders. Tricky since
      // getArea in general doesn't take a req object and neither does
      // getPage, we check permissions before that point.
      snippets.get({}, criteria, function(err, snippets) {
        if (err) {
          item._snippets = [];
          console.log(err);
          return callback(err);
        }
        if (item.by === 'id') {
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
        item._snippets = snippets;
        return callback(null);
      });
    }
  };
};

