module.exports = function(options) {
  return new Widget(options);
};

function Widget(options) {
  var apos = options.apos;
  var snippets = options.snippets;
  var app = options.app;
  var self = this;

  // One asset folder for the whole snippets module is fine
  self.pushAsset = function(type, name) {
    snippets.pushAsset(type, name);
  };

  // This widget should be part of the default set of widgets for areas
  // (this isn't mandatory)
  apos.defaultControls.push('snippet');

  // Include our editor template in the markup when aposTemplates is called
  self.pushAsset('template', 'snippetEditor');

  // Make sure that aposScripts and aposStylesheets summon our assets

  self.pushAsset('script', 'widget');
  self.pushAsset('stylesheet', 'widget');

  apos.itemTypes.snippet = {
    widget: true,
    label: 'Snippet',
    css: 'snippet',
    sanitize: function(item) {
      // Not much to do - either they gave us a valid snippet id or they
      // didn't, if they didn't it just won't find anything
    },
    render: function(data) {
      return snippets.render('widget', data);
    },

    // Asynchronously load the content of the snippet we're reusing.
    // The properties you add should start with an _ to denote that
    // they shouldn't become data attributes or get stored back to MongoDB

    load: function(item, callback) {

      item._snippet = null;

      var criteria = {};
      if ((item.by === 'tag') && (item.tags)) {
        criteria.tags = { $in: item.tags };
      } else if ((item.by === 'id') && (item.ids)) {
        criteria._id = { $in: item.ids };
      }
      self.addSort(criteria);
      snippets.get(criteria, function(err, snippets) {
        if (err) {
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
}
