var _ = require('lodash');
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

  // For use in titling the "type part of a title" field
  var titleField = _.find(self.snippets.schema, function(field) {
    return field.name === 'title';
  }) || { label: 'Title' };

  // Include our editor template in the markup when aposTemplates is called
  self.pushAsset('template', 'widgetEditor', {
    when: 'user',
    data: {
      widgetEditorClass: 'apos-' + self.snippets._pluralCss + '-widget-editor',
      instanceLabel: self.snippets.instanceLabel,
      pluralLabel: self.snippets.pluralLabel,
      titleLabel: titleField.label || 'Title'
    }
  });

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

  self.widget = true;
  self.css = self.apos.cssName(self.name);
  self.sanitize = function(item) {
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
  };

  self.renderWidget = function(data) {
    return self.snippets.render('widget', data);
  };

  // Snippet text contributes to the plaintext of a page
  self.getPlaintext = function(item, lines) {
    var s = '';
    _.each(item._snippets, function(snippet) {
      s += self.apos.getSearchTextsForPage(snippet) + "\n";
    });
    return s;
  };

  // Snippet text contributes to search text of page only if the link is
  // firm - made via id - and not dynamic - made via tag
  self.addSearchTexts = function(item, texts) {
    if (self.snippets._searchable) {
      // The snippets are searchable in their own right,
      // so don't bloat the search text of the pages
      // they happen to be featured on today. On DR we
      // found we were hitting the 16MB document limit
      // just on account of the search text alone when
      // featuring large numbers of blog post teasers on
      // the home page, and the home page as the first result
      // for everything is really not helpful
      return;
    }
    if (item.by === 'id') {
      _.each(item._snippets, function(snippet) {
        var pageTexts = self.apos.getSearchTextsForPage(snippet);
        // We have to do this because we are updating texts by reference
        _.each(pageTexts, function (text) {
          texts.push(text);
        });
      });
    }
  };

  self.addDiffLines = function(item, lines) {
    if (item.by === 'id') {
      lines.push(self.label + ': items selected: ' + ((item.ids && item.ids.length) || 0));
    } else {
      lines.push(self.label + ': tags selected: ' + item.tags.join(', '));
    }
  };

  // Asynchronously load the content of the snippets we're reusing.
  // The properties you add should start with an _ to denote that
  // they shouldn't become data attributes or get stored back to MongoDB

  self.load = function(req, item, callback) {
    var criteria = {};
    var options = {};

    self.addCriteria(item, criteria, options);

    // If the criteria are simple enough check a local cache that is kept
    // for the duration of this request. This can lead to a large speedup
    // if there are many snippet widgets in the content being displayed that
    // reference the same content. This simplicity test keeps us out of trouble
    // if something that can't be serialized neatly as JSON is part of a
    // criteria object in some subclass of snippets (examples: dates, regexes)

    var key;
    var cacheable = true;
    for (key in criteria) {
      if ((key !== '_id') && (key !== 'tags')) {
        cacheable = false;
      }
    }

    if (cacheable) {
      // Make sure the type is part of the key!
      key = self.name + '#' + JSON.stringify(criteria) + '#' + (options.limit || '');
      if (req.aposSnippetLoadCache && req.aposSnippetLoadCache[key]) {
        item._snippets = req.aposSnippetLoadCache[key];
        return setImmediate(function() {
          return callback(null);
        });
      }
    }

    return self.snippets.get(req, criteria, options, function(err, results) {
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
        if (err) {
          return callback(err);
        }
        if (cacheable) {
          req.aposSnippetLoadCache = req.aposSnippetLoadCache || {};
          req.aposSnippetLoadCache[key] = snippets;
        }
        item._snippets = snippets;
        return callback(null);
      }
    });
  };

  self.empty = function(item) {
    return (!item._snippets) || (!item._snippets.length);
  };
};

