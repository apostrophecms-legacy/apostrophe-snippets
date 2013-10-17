# apostrophe-snippets

**Table of Contents**
* [Using Snippets Directly](#using-snippets)
  * [Overriding Snippet Templates](#overriding-templates)
  * [Inserting the Snippets Admin Menu](#inserting-admin-menu)
  * [Disabling Snippets as a Page Type](#disabling-snippets)
* [Creating Your Own Content Types](#sublassing)
  * [Server-Side Code](#server-side)
  * [Instance Types](#instance-types)
  * [Custom Templates](#custom-templates)
  * [Snippets = Pages Outside the Page Tree](#snippets-are-pages)
  * [Invoking the Base Class Constructor](#base-class-constructor)
  * [Customizing the Dispatcher](#custom-dispatcher)
  * [How the `dispatch` Method Works](#dispatch-method)
  * [Extending the `dispatch` method](#extending-dispatch)
  * [The Page Loader](#page-loader)
  * [Adding New Properties to Snippets](#adding-properties)
* [Joins in Schemas](#joins)
  * [one-to-one](#one-to-one)
  * [reverse](#reverse)
  * [nested joins](#nested)
  * [many-to-many](#many-to-many)
  * [reverse many-to-many](#reverse-many-to-many)
  * [Complicated Relationships](#complicated-relationships)
  * [Accessing Relationship Properties in a Reverse Join](#relationship-properties-in-reverse-join)
* [Custom Properties Without Schemas](#custom-properties-no-schema)
* [Adding Properties to new and edit dialogs](#new-and-edit-dialog-properties)
* [Subclassing on the browser side](#browser-subclassing)
  * [Other methods to consider overriding in the browser](#browser-other-methods)
* [Manipulating Snippet Objects in the Database](#manipulating-snippets)
* [Pushing JS and CSS Assets to the Browser](#pushing-assets)
* [Saving Extra Properties on the Server](#saving-extra-properties)
* [Extending the Get Method](#extending-get)
* [Adding Criteria to the Manage Dialog](#adding-manage-criteria)
* [Two Pages with the same Instance Type](#two-pages)
* [RSS Feed Options](#rss-feed)
  * [Customizing the Feed](#rss-feed-customizing)

`apostrophe-snippets` adds a repository of reusable content snippets to the [Apostrophe](http://github.com/punkave/apostrophe) content management system. Just as important, `apostrophe-snippets` provides a base on which the `apostrophe-blog`, `apostrophe-events` and other modules are built, among other modules that introduce new types of content. One can add a page to the site that displays a collection of snippet titles in alphabetical order and click on these to access individual snippets at their own "permalink" URLs. The blog and events modules extend this behavior to achieve similar goals with a minimum of code duplication.

In addition, snippets can be inserted into any content area via the snippet widget. This is the most common direct use of the snippets module: inserting, for instance, driving directions in many places on the site, while maintaining the ability to edit that content in just one place.

So there are four main ways a snippet might appear to the end user:

* Via a *snippet widget*, which can be used to insert one or more snippets into any content area. The snippet widget appears as an icon in the content editor's toolbar. The snippet widget can also be used as a singleton (via `aposSingleton`). This is the most common direct use for the snippets module.
* On an *index page*, providing a way to browse many snippets, potentially filtered by tag. Snippet index pages are part of Apostrophe's page tree; you can change the type of any page to a "snippets" page via the "page settings" menu. You might use them to display a collection of related documents which don't fit into your tree of pages. You can lock down the snippets that will be displayed on a particular snippet index page by entering specific tags via "Page Settings" on the "Pages" menu. Although available directly, this feature is most often used in subclasses of snippets, such as the blog module.
* On a *show page*, featuring that snippet by itself at its own URL. As far as the `apostrophe-pages` module and Apostrophe's page tree are concerned, a "show page" is actually just an extension of an index page. The snippets module spots the slug of the index page in the URL, then takes the remainder of the URL and looks for a snippet with that slug. "Subclasses" of snippets, like the blog module, may easily alter the way the remainder of the URL is used to accommodate displaying a publication date in the URL.
* Via an RSS feed. Adding `?feed=rss` to the URL of a snippet index page automatically generates an RSS feed. Methods of the snippets module can be easily overridden and extended to support more feed types.

## Using Snippets Directly <a id="using-snippets"></a>

Snippets are quite useful by themselves. Quite often, the snippet widget is enabled in a project to allow reuse of frequently-changing content displayed in a variety of places at the end user's discretion, rather than hardcoding a shared area or singleton into the page templates.

To enable snippets in a project, you'll need the following code (taken from `app.js` of the sandbox project):

```javascript
var snippets;
...
// After initializing Express, apostrophe and apostrophe-pages
snippets = require('apostrophe-snippets')({
  apos: apos,
  pages: pages,
  app: app,
  searchable: false,
  widget: true,
}, callback);
```

Note that the snippet module's initialization function requires a callback. Since most modules relating to Apostrophe require callbacks we recommend using `async.series` to easily call them all in sequence. See the sandbox project for a simple example.

### Overriding Snippet Templates <a id="overriding-templates"></a>

#### Don't Work So Hard! Use apostrophe-site

*See the [apostrophe-site](http://github.com/punkave/apostrophe-site) module for a very easy way to override the templates of snippets, blogs, event calendars or any other module derived from snippets.* The rest of this section concerns how to do it without `apostrophe-site` and basically reveals the nuts and bolts of how it really works. Most of this information is still relevant in more advanced projects even if you do use `apostrophe-site`.

#### Doing It Without apostrophe-site

If you'd like to just create custom templates for an existing snippet module, you can create a project-specific override of that module. The current Apostrophe "best-practice" for this involves creating a top-level directory named "lib" (i.e. /my-project/lib/), and then creating custom versions of the template there (i.e. /my-project/lib/snippets).

The bare requirements for each of these template overrides is an index.js file (/my-project/lib/snippets/index.js) and a client-side file called "editor.js" which lives in a  directory named "public/js" (/my-project/lib/snippets/public/js/editor.js). We'll take a brief look at the bare bones of these files below.

But first, we'll need to update our app.js. Using our snippets example from above, we'll change our initAposSnippets function in app.js to the following:

```javascript
var snippets;
...
// After initializing Express, apostrophe and apostrophe-pages
snippets = require('./lib/snippets/index.js')({
  apos: apos,
  pages: pages,
  app: app,
  searchable: false,
  widget: true,
}, callback);
```

Note that we are now requiring our local overide of the module instead of the npm installed "apostrophe-snippets." We can do this because we'll be calling that module in our local override. Let's dig into these two files:

To begin with, we'll need to create a server-side file called "index.js" directly inside our custom module folder (i.e. /my-project/lib/snippets/index.js ). The file should roughly contain the following:

```javascript
// Extend the snippets module just enough to get our own views folder
var _ = require('underscore');
var snippets = require('apostrophe-snippets');

module.exports = mySnippets;

function mySnippets(options, callback) {
  return new mySnippets.MySnippets(options, callback);
}

mySnippets.MySnippets = function(options, callback) {
  var self = this;

  options.modules = (options.modules || []).concat([ { dir: __dirname, name: 'mySnippets' } ]);

  // We're not doing much other than establishing a context for template overrides,
  // so just let the base constructor invoke the callback for us
  return snippets.Snippets.call(this, options, callback);
};
```

It's important to note that we're creating a specifically different directory with a different name (here, it's "mySnippets"). Without this specific name, the app won't know which directory to look in for various functions.

In addition to the server-side file, we'll need to build a file for the browser to access and build from. So we'll create a file named "editor.js" in a "js" directory inside of a "public" directory in this module override (i.e. /my-project/lib/snippets/public/js/editor.js). We'll throw the following base functionality into that editor.js file:

```javascript
// No changes to the browser-side behavior of snippets for now

function MySnippets(options) {
  var self = this;
  AposSnippets.call(self, options);
}

MySnippets.addWidgetType = function(options) {
  AposSnippets.addWidgetType(options);
};
```

In this editor.js file, we're simply connecting the override module to the original module's functionality. We're not getting fancy here (you can read about extending the functionality below).

Once again, we'll need to update the aposInitSnippets function in our app.js to make sure we're calling the right constructor on the browser-side:

```javascript
snippets = require('./lib/modules/snippets/index.js')({
  apos: apos,
  pages: pages,
  app: app,
  searchable: false,
  widget: true,
  browser: {
    construct: 'MySnippets'
  }
}, callback);
```

Now that we've got the overrides setup, we can create a "views" directory in the module overide folder and customize the templates for our project (i.e. /lib/snippets/views/templateFile.html). You can copy any or all files from the "views" directory of the original module, but note that to add any extra fields or extend the functionality of the module, you'll need to subclass that particular snippet (or simply create your own content type). Read on below about subclassing a snippets module.

### Inserting the Snippets Admin Menu ### <a id="inserting-admin-menu"></a>

The above code sets up snippets both as a page type (for creating snippet index pages) and as a widget, and also provides a "snippets" admin dropdown menu which can be included in your outer layout via the following nunjucks code:

```twig
{{ aposSnippetMenu({ edit: editSnippet }) }}
```

See `outerLayout.html` in the sandbox project for the best way of handling the admin menus.

### Disabling Snippets As A Page Type ### <a id="disabling-snippets"></a>

If you don't want snippets to be available as a page type and are only interested in them as widgets, you can choose to leave them out when you call the `setMenu` method of the `apostrophe-pages` module at the end of your Apostrophe initialization code:

```javascript
pages.setMenu([
  { name: 'default', label: 'Default (Two Column)' },
  { name: 'home', label: 'Home Page' },
  { name: 'blog', label: 'Blog' },
  { name: 'events', label: 'Events' },
  // Let's not offer snippet index pages on the site
  // { name: 'snippets', label: 'Snippets' }
]);
```

If you do not call `pages.setMenu`, you'll get all of the page types that were registered in your application, in the order they were registered. In most cases you'll want to use `pages.setMenu` to change the order, change the labels and leave out a few page types.

## Creating Your Own Content Types: Subclassing Snippets ## <a id="sublassing"></a>

It's possible to create your own content types based on snippets. This has a lot of advantages. All of the tools to manage snippets have already been built for you and are easily extended without code duplication to accommodate new content. The snippets module also implements an Apostrophe page loader function for you, ready to display "index pages" and "show pages" out of the box. And of course a widget for reusing snippets anywhere on the site is built in.

Absolutely nothing is preventing you from implementing your own page loader functions and your own admin tools for managing content, and sometimes this may be desirable. But in most cases subclassing snippets is the right way to go.

Subclasses of snippets can extend their behavior on both the server side and the browser side. Server-side code is often needed to change the way snippets are selected and filtered and to extend snippet objects with new properties. And browser-side code is needed to add more fields to the management interface, as well as extending the widget with browser-side JavaScript as we'll see below.

The simplest example of a subclass of snippets is currently the `apostrophe-blog` module. Let's take a look at how it works.

### Your module and its server-side code ### <a id="server-side"></a>

The `apostrophe-blog` module is a separate npm module, with its own `index.js` file as an entry point on the server side (the file that is loaded by `require('apostrophe-blog')`). npm modules are a great way to distribute subclasses of snippets as open source. But if you need a private subclass in your project, we recommend creating a `lib/modules/mymodule` folder, requiring `index.js` from there explicitly, and otherwise writing your code exactly as you would in a public npm module.

We structure `index.js` this way:

```javascript
var _ = require('underscore');
var snippets = require('apostrophe-snippets');

module.exports = blog;

function blog(options, callback) {
  return new blog.Blog(options, callback);
}

blog.Blog = function(options, callback) {
  ...
}
```

By setting `module.exports` to a function that invokes the constructor, we provide a convenient way to invoke it directly, as shown earlier. By attaching the constructor to that function as a property, we provide a way to access it from another module if we wish to subclass the blog.

Now let's delve into the `blog.Blog` constructor function. The first step is to capture `this` into a variable called `self`, so that we can always access it even if `this` changes in the context of a callback:

```javascript
var self = this;
```

By nesting all of our other functions and methods inside this constructor we ensure that they can all see `self`.

Next we'll need to call the constructor for the snippets module so that we can inherit its behavior. (Other programming languages call this "invoking the base class constructor" or something similar.) But first we'll alter some of its options so that the snippets module manipulates and talks about blog posts instead of snippets. Note, however, that we use the `_.defaults` method to achieve this. This ensures that we don't interfere if the options have already been set, either at the project level (`app.js`) or by a subclass of the blog module (yes, you can subclass a subclass).

```javascript
_.defaults(options, {
  instance: 'blogPost',
  name: options.name || 'blog',
  label: options.name || 'Blog',
  // Don't specify an icon unless it is actually present in the icon font
  // (TODO: make it easier for third parties to add icons)
  icon: false,
  // The default would be aposBlogPostMenu, this is more natural
  menuName: 'aposBlogMenu'
});

options.modules = (options.modules || []).concat([ { dir: __dirname, name: 'blog' } ]);
```

`_.defaults` is simple enough, but what is all this `options.modules` business? `options.modules` is a list containing information about all of the parent classes of our subclass, so that the snippets module can deliver all of the necessary CSS and JavaScript assets to the browser. Each entry in the array has a `dir` property and a `name` property. The `name` property should match the `name` option. The `name` option will be overridden if someone subclasses our blog, but every subclass just adds more elements to the `modules` array so that information about all of the parent classes is available.

### Instance Types: Carving Out Our Own Content Type ### <a id="instance-types"></a>

The `instance` option is the most important decision we'll make.

Is our goal simply to offer another choice of page type that presents snippets differently, drawing from the same pool of content?

Or do we want a separate collection entirely, one that does not show up when managing regular snippets?

For a blog, we want the latter: a separate collection of our own, just for blog articles, with its own admin menu.

To achieve that, we set the `instance` option, changing the default setting (`snippet`) to our own setting (`blogPost`).

When we create a subclass of snippets with its own instance type, we become responsible for providing an admin menu for that type. We'll do that in our own version of the `menu.html` template, overriding the default version in the snippets module, as explained below.

### Custom Templates For Our Subclass ### <a id="custom-templates"></a>

We'll want to override some or all of the nunjucks templates provided with the snippets module. To do that, we'll add a `views` folder to our own module (whether it lives in npm or in a lib/modules folder).

To enable that, we'll set the `dirs` option before calling the parent class constructor:

```javascript
// Find our templates before the snippet templates (a chain of overrides)
options.dirs = (options.dirs || []).concat([ __dirname ]);
```

This code ensures that the snippet templating engine will look for templates in our own module's `views/` subdirectory before it checks the `views/` subdirectory of the `apostrophe-snippets` module. Notice that we take care to put our own directory after any directories supplied to us as options. This allows our own module to be subclassed, or just tweaked a little at the project level at the time it is initialized.

Now we can have our own `views/index.html`, `views/show.html` and `views/widget.html` templates.

Since the instance type is different, we will also want new `views/menu.html`, `views/new.html`, `views/edit.html` and `views/manage.html` templates. The `menu` template presents the admin dropdown menu with options such as "new article" and "manage articles." The `new` template presents the modal dialog for creating a new article. And the `edit` template presents the modal dialog for editing an existing article. The `edit` template extends the `new` template to avoid redundancy. And both make heavy use of `snippetMacros.html` which offers conveniences for rendering each type of field in a form.

The `manage` template displays a list view of all snippets, with filters and (soon) pagination, allowing the user to edit or delete them as needed.

*You must edit each of these templates to use the right CSS class names based on your instance type.* Follow the pattern in the existing templates for snippets.* For instance, `apos-manage-snippet` becomes `apos-manage-blog-post`.

*It is important to note that adding a new field in these templates does not mean it will automatically be sent by the browser or saved by the server.* We'll address that a little further on below under "adding new properties to your snippets."

### Snippets = pages outside the main page tree ### <a id="snippets-are-pages"></a>

This is a good time to explain how snippets are actually stored. Snippets are really nothing more than objects in the `aposPages` MongoDB collection, with the `type` property set to `snippet` and a slug that *does not* begin with a `/`, so that they don't appear directly as part of the page tree. Since they exist outside of the page tree, they don't have `rank` or `path` properties. In other respects, though, they are much like regular pages, which means they have a `title` property and an `areas` property containing rich content areas as subproperties. In addition, they can have properties that are unique to snippets.

Since snippets are pages, we can leverage all the capabilities already baked into Apostrophe to manage pages. In particular, the `getPage` and `putPage` methods are used to retrieve and store pages. Those methods check permissions, take care of version control, implement search indexing and perform other tasks common to snippets and regular pages.

### Invoking the Base Class Constructor ### <a id="base-class-constructor"></a>

Now that we've set up our options, it's time to invoke the snippet module's constructor so that we can inherit everything it does for us. Then, after doing additional work, we should invoke the callback if any.

```javascript
// Call the base class constructor. Don't pass the callback, we want to invoke it
// ourselves after constructing more stuff
snippets.Snippets.call(this, options, null);

... do more work here, as described in the following sections ...

if (callback) {
  process.nextTick(function() { return callback(null); });
}
```

"What is this `.call` business about?"

`snippets.Snippets` refers to the constructor function for the `apostrophe-snippets` module. JavaScript's `call` keyword is a special syntax that means "invoke this function as if it were a method of the first argument passed to `call`." By passing `this` as the first argument to `call`, we ensure that the snippet module's constructor's `this` is the same object as our own `this`.

In English, that means that we get all the methods of the snippets module in our own module, for free. And now we can start overriding and extending them.

### Customizing the dispatcher: handling URLs differently ### <a id="custom-dispatcher"></a>

By default, a snippet index page shows an index of snippets when it is accessed directly. And it shows individual snippets if the rest of the URL, after the slug of the snippet index page, matches the slug of the snippet. It looks like this:

http://mysite.com/policies/parties

Where "/policies" is the slug of a blog index page that the user has added to the page tree, and "parties" is the slug of an individual snippet. (Policies are a rather common use case for directly using snippet index pages on a site.)

### How the `dispatch` method works ### <a id="dispatch-method"></a>

The snippet module has a `dispatch` method that figures this out. All that method really does is:

1. Look at `req.remainder`, which contains the rest of the URL following the URL of the page itself. This will be an empty string if the visitor is looking at the index page itself.

2. Decide whether to serve an index page, a show page, or something else unique to your module's purpose.

3. Store any extra variables you wish to pass to the template you'll be rendering as properties of the `req.extras` object. This is how you'll pass your snippet or snippets to your template after fetching them. Typically the dispatcher calls the `get` method of the snippet module to fetch snippets according to criteria taken from the page settings as well as the query string or portions of the URL. Extending the `get` method is very common and provides a way to add additional criteria that can be used together with the built-in criteria for snippets, such as tags. The `get` method also takes care of permissions, widget loader functions, and other things you really don't want to reinvent. And the `get` method provides not just the snippets but also a list of distinct tags that appear among that collection of snippets. The `get` method also implements pagination, together with the default dispatcher and the `addCriteria` method. So we strongly recommend extending `get` rather than querying MongoDB yourself in most cases.

4. Set `req.template` to a function that will render the content of the response when passed the same data that is normally provided to a page template, such as `slug`, `page` (the index page object), `tabs`, `ancestors`, `peers`, etc. Fortunately the snippets module provides a handy `renderer` method for this purpose. So if you want to render the `show.html` template in the `views` subdirectory of your module, you can just write:

```javascript
req.template = self.renderer('show');
```

You can also set `req.notfound = true;` if appropriate, for instance if the URL looks like a show page but there is no actual snippet that maches the URL.

### Extending the `dispatch` method without overriding it completely ### <a id="extending-dispatch"></a>

You can override the `dispatch` method completely if you wish, and sometimes you'll need to because your needs are sufficiently different. But much of the time there is an easier way.

If you just need to change the way the show page URL is parsed, for instance to handle a publication date in the URL like:

    /2013/05/01/hooray-for-apostrophe

Then you can override the `self.isShow` method. The default version is:

```javascript
self.isShow = function(req) {
  if (req.remainder.length) {
    // Perhaps it's a snippet permalink
    return req.remainder.substr(1);
  }
  return false;
};
```

This just assumes any URL that isn't empty is a `/` followed by a snippet slug. This method should return the slug of the snippet (without actually checking whether it exists) or `false` if the URL doesn't look like a snippet show page.

To account for a publication date appearing first in the URL, we could write the following in our module's constructor, *after* the call to the snippet module's constructor so that our version overrides the other:

```javascript
self.isShow = function(req) {
  var matches = req.remainder.match(/^\/\d+\/\d+\/\d+\/(.*)$/);
  if (matches) {
    return matches[1];
  }
  return false;
};
```

(Note that we don't actually check the publication date. It's just decoration. Snippet slugs are always unique. If a user creates a snippet with a title that matches an existing snippet, the slug is automatically made unique through the addition of random digits.)

There's also another way to achieve the same goal. This technique is worth looking at because it shows us how to call the original `dispatch` method as part of our override. This is similar to calling `parent::dispatch` in PHP or `super.dispatch` in Java:

```javascript
// Grab the "superclass" version of the dispatch method so we can call it
var superDispatch = self.dispatch;

self.dispatch = function(req, callback) {
  if (req.remainder.length) {
    var matches = req.remainder.match(/^\/\d+\/\d+\/\d+\/(.*)$/);
    if (matches) {
      req.remainder = '/' + matches[1];
    }
  }
  superDispatch.call(this, req, callback);
};
```

Here we stash the original method in the variable `superDispatch`, then use the `call` keyword to invoke it as if it were still a method.

This is an important technique because in many cases we do need the default behavior of the original method and we don't want to completely override it. When you completely override something you become responsible for keeping track of any changes in the original method. It's better to override as little as possible.

### The Page Loader Function ### <a id="page-loader"></a>

The dispatcher is called from a page loader function built in to the snippets module. Page loader functions implement the listener pattern and are given a chance to intervene when pages in the page tree are retrieved by the `apostrophe-pages` module. See the `apostrophe-pages` module for more information about page loader functions in general.

All you need to know right now is that you must add this page loader function to the `load` option passed when configuring `apostrophe-pages` in `app.js`:

```javascript
load: [
  // Load the global virtual page with things like the shared footer
  'global',
  // Custom loaders for snippets and their derivatives
  snippets.loader,
  blog.loader, ...
]
```

### Adding New Properties To Your Snippets ### <a id="adding-properties"></a>

#### Using Schemas

*There is a very easy way to do this.* Snippets now support a simple JSON format for creating a schema of fields. Both the browser side and the server side understand this, so all you have to do is add them to the dialogs as described below and set up the schema. You can still do it the hard way, however, if you need custom behavior.

Here is a super-simple example of a project-level subclass of the people module (itself a subclass of snippets) that adds new fields painlessly. Here I assume you are using `apostrophe-site` to configure your site:

```javascript
... Configuring other modules ...
'apostrophe-people': {
  addFields: [
    {
      name: 'workPhone',
      type: 'string'
    },
    {
      name: 'workFax',
      type: 'string'
    },
    {
      name: 'department',
      type: 'string'
    },
    {
      name: 'isRetired',
      type: 'boolean'
    },
    {
      name: 'isGraduate',
      type: 'boolean'
    },
    {
      name: 'classOf',
      type: 'string'
    },
    {
      name: 'location',
      type: 'string'
    }
  ]
}, ... more modules ...
```

#### What Field Types Are Available?

Currently:

`string`, `boolean`, `integer`, `float`, `url`, `area`, `singleton`

Except for `area`, all of these types accept a `def` option which provides a default value if the field's value is not specified.

The `integer` and `float` types also accept `min` and `max` options and automatically clamp values to stay in that range.

When using the `area` and `singleton` types, you may include an `options` property which will be passed to that area or singleton exactly as if you were passing it to `aposArea` or `aposSingleton`.

When using the `singleton` type, you must always specify `widgetType` to indicate what type of widget should appear.

Joins are also supported (see below).

#### Altering Existing Fields

There is also an `alterFields` option available. This must be a function which receives the fields array as its argument and modifies it. Use this when you need to change fields already configured for you by the module you are extending. It is possible to remove the `body` and `thumbnail` areas in this way.

### Joins in Schemas ### <a id="joins"></a>

You may use the `join` type to automatically pull in related objects from this or another module. Typical examples include fetching events at a map location, or people in a group. This is very cool.

*"Aren't joins bad? I read that joins were bad in some NoSQL article."*

Short answer: no.

Long answer: sometimes. Mostly in so-called "webscale" projects, which have nothing to do with 99% of websites. If you are building the next Facebook you probably know that, and you'll denormalize your data instead and deal with all the fascinating bugs that come with maintaining two copies of everything.

Of course you have to be smart about how you use joins, and we've included options that help with that.

##### One-To-One Joins ##### <a id="one-to-one"></a>

In your configuration for the events module, you might write this:

```javascript
'apostrophe-events': {
  addFields: [
    {
      name: '_location',
      type: 'joinByOne',
      withType: 'mapLocation',
      idField: 'locationId'
    }
  ]
}
```

And in your override of `new.html` you'll need to provide a select element to pick the location:

```twig
{{ snippetSelect('locationId', 'Location') }}
```

Now the user can pick a map location for an event. And anywhere the event is used on the site, you'll be able to access the map location as the `_location` property. Here's an example of using it in a Nunjucks template:

```twig
{% if item._location %}
  <a href="{{ item._location.url | e }}">Location: {{ item._location.title | e }}</a>
{% endif %}
```

The id of the map location "lives" in the `location_id` property of each event, but you won't have to deal with that directly.

*Always give your joins a name starting with an underscore.* This warns Apostrophe not to store this information in the database permanently where it will just take up space, then get re-joined every time anyway.

##### Reverse Joins ##### <a id="reverse"></a>

This is awesome. But what about the map module? Can we see all the events in a map location?

Yup:

```javascript
'apostrophe-map': {
  addFields: [
    {
      name: '_events',
      type: 'joinByOneReverse',
      withType: 'event',
      idField: 'locationId'
    }
  ]
}
```

Now, in the `show` template for the map module, we can write:

```twig
{% for event in item._events %}
  <h4><a href="{{ event.url | e }}">{{ event.title | e }}</a></h4>
{% endfor %}
```

"Holy crap!" Yeah, it's pretty cool.

Note that the user always edits the relationship on the "owning" side, not the "reverse" side. The event has a `location_id` property pointing to the map, so users pick a map location when editing an event, not the other way around.

##### Nested Joins: You Gotta Be Explicit ##### <a id="nested"></a>

*"Won't this cause an infinite loop?"* When an event fetches a location and the location then fetches the event, you might expect an infinite loop to occur. However Apostrophe does not carry out any further joins on the fetched objects unless explicitly asked to.

*"What if my events are joined with promoters and I need to see their names on the location page?"* If you really want to join two levels deep, you can "opt in" to those joins:

```javascript
'apostrophe-map': {
  addFields: [
    {
      name: '_events',
      ...
      withJoins: [ '_promoters' ]
    }
  ]
}
```

This assumes that `_promoters` is a join you have already defined for events.

*"What if my joins are nested deeper than that and I need to reach down several levels?"*

You can use "dot notation," just like in MongoDB:

```javascript
withJoins: [ '_promoters._assistants' ]
```

This will allow events to be joined with their promoters, and promoters to be joiend with their assistants, and there the chain will stop.

You can specify more than one join to allow, and they may share a prefix:

```javascript
withJoins: [ '_promoters._assistants', '_promoters._bouncers' ]
```

Remember, each of these joins must be present in the configuration for the appropriate module.

#### Many-To-Many Joins ##### <a id="many-to-many"></a>

Events can only be in one location, but stories can be in more than one book, and books also contain more than one story. How do we handle that?

Consider this configuration for a `books` module:

```javascript
'books': {
  ... other configuration, probably subclassing snippets ...
  addFields: [
    {
      name: '_stories',
      type: 'joinByArray',
      withType: 'story',
      idsField: 'storyIds',
      sortable: true
    }
  ],
}
```

And, in `new.html` for our books module:

```twig
{{ snippetSelective('storyIds', 'Stories', {
  placeholder: 'Type Title Here'
}) }}
```

`snippetSelective` lets users select multiple stories, with autocomplete of the titles.

Now we can access all the stories from the show template for books (or the index template, or pretty much anywhere):

```twig
<h3>Stories</h3>
{% for story in item._stories %}
  <h4><a href="{{ story.url | e }}">{{ story.title | e }}</a></h4>
{% endfor %}
```

*Since we specified `sortable:true`*, the user can also drag the list of stories into a preferred order. The stories will always appear in that order in the `._stories` property when examinining a book object.

*"Many-to-many... sounds like a LOT of objects. Won't it be slow and use a lot of memory?"*

It's not as bad as you think. Apostrophe typically fetches only one page's worth of items at a time in the index view, with pagination links to view more. Add the objects those are joined to and it's still not bad, given the performance of v8.

But sometimes there really are too many related objects and performance suffers. So you may want to restrict the join to occur only if you have retrieved only *one* book, as on a "show" page for that book. Use the `ifOnlyOne` option:

```javascript
'stories': {
  addFields: [
    {
      name: '_books',
      withType: 'book',
      ifOnlyOne: true
    }
  ]
}
```

Now any call to fetch books that retrieves only one object will carry out the join with stories. Any call that returns more than one object won't. You don't have to specifically call `books.getOne` rather than `books.get`.

Hint: in index views of many objects, consider using AJAX to load related objects when the user indicates interest if you don't want to navigate to a new URL in the browser.

#### Reverse Many-To-Many Joins #### <a id="reverse-many-to-many"></a>

We can also access the books from the story if we set the join up in the stories module as well:

```javascript
'stories': {
  ... other needed configuration, probably subclassing snippets ...
  addFields: [
    {
      name: '_books',
      type: 'joinByArrayReverse',
      withType: 'book',
      idsField: 'storyIds'
    }
  ]
}
```

Now we can access the `._books` property for any story. But users still must select stories when editing books, not the other way around.

#### When Relationships Get Complicated #### <a id="complicated-relationships"></a>

What if each story comes with an author's note that is specific to each book? That's not a property of the book, or the story. It's a property of *the relationship between the book and the story*.

If the author's note for every each appearance of each story has to be super-fancy, with rich text and images, then you should make a new module that subclasses snippets in its own right and just join both books and stories to that new module.

But if the relationship just has a few simple attributes, there is an easier way:

```javascript
'books': {
  ... other needed configuration, probably subclassing snippets ...
  addFields: [
    {
      name: '_stories',
      type: 'joinByArray',
      withType: 'story',
      idsField: 'storyIds',
      relationshipField: 'storyRelationships',
      relationship: [
        {
          name: 'authorsNote',
          type: 'string'
        }
      ],
      sortable: true
    }
  ]
}
```

And, in `new.html`:

```twig
{{ snippetSelective('_stories', 'Stories', {
    placeholder: 'Type Title Here',
    relationship: {
      'authorsNote': {
        label: "Author's Note",
      }
    }
}) }}
  ```

Currently "relationship" properties can only be of type `string` (for text), `select` or `boolean` (for checkboxes). Otherwise they behave like regular schema properties.

*Warning: the relationship field names `label` and `value` must not be used.* These names are reserved for internal implementation details.

Form elements to edit relationship fields appear next to each entry in the list when adding stories to a book. So immediately after adding a story, you can edit its author's note.

Once we introduce the `relationship` option, our templates have to change a little bit. The `show` page for a book now looks like:

```twig
{% for story in item._stories %}
  <h4>Story: {{ story.item.title | e }}</h4>
  <h5>Author's Note: {{ story.relationship.authorsNote | e }}</h5>
{% endfor %}
```

Two important changes here: *the actual story is `story.item`*, not just `story`, and `relationship fields can be accessed via `story.relationship`*. This change kicks in when you use the `relationship` option.

Doing it this way saves a lot of memory because we can still share book objects between stories and vice versa.

#### Accessing Relationship Properties in a Reverse Join #### <a id="relationship-properties-in-reverse-join"></a>

You can do this in a reverse join too:

```javascript
'stories': {
  ... other needed configuration, probably subclassing snippets ...
  addFields: [
    {
      name: '_books',
      type: 'joinByArrayReverse',
      withType: 'book',
      idsField: 'storyIds',
      relationshipField: 'storyRelationships',
      relationship: [
        {
          name: 'authorsNote',
          type: 'string'
        }
      ]
    }
  ]
}
```

Now you can write:

```twig
{% for book in item._books %}
  <h4>Book: {{ book.item.title | e }}</h4>
  <h5>Author's Note: {{ book.relationship.authorsNote | e }}</h5>
{% endfor %}
```

As always, the relationship fields are edited only on the "owning" side (that is, when editing a book).

*"What is the `relationshipField` option for? I don't see `story_relationships` in the templates anywhere."*

Apostrophe stores the actual data for the relationship fields in `story_relationships`. But since it's not intuitive to write this in a template:

```twig
{# THIS IS THE HARD WAY #}
{% for story in book._stories %}
  {{ story.item.title | e }}
  {{ book.story_relationships[story._id].authorsNote | e }}
{% endif %}
```

Apostrophe instead lets us write this:

```twig
{# THIS IS THE EASY WAY #}
{% for story in book._stories %}
  {{ story.item.title | e }}
  {{ story.relationship.authorsNote | e }}
{% endif %}
```

*Much better.*

### Adding Custom Properties Without Schemas ### <a id="custom-properties-no-schema"></a>

Here's an example of adding a property without using the schema mechanism. This is useful if you need to support something not covered by schemas.

Blog posts have a property that regular snippets don't: a publication date. A blog post should not appear before its publication date. To implement that, we need to address several things:

1. Editing that property, as part of the `new.html` and `edit.html` dialogs.

2. Sending that property to the server, via browser-side JavaScript as shown below.

3. Saving the property on the server, by extending the `beforeSave` method on the server side, or `beforeInsert` and `beforeUpdate` if you need to treat new and updated snippets differently.

4. Making that property part of our criteria for fetching snippets, by extending the `get` method of the snippets module.

### Adding Properties to the New and Edit Dialogs ### <a id="new-and-edit-dialog-properties"></a>

This is the easiest part. First copy `new.html` and `edit.html` from the `view` folder of the snippets module to your own module's `view` folder. Then add the new fields in `new.html`, like this:

```twig
{{ snippetText('publication-date', 'Publication Date') }}
```

See `snippetMacros.html` for all of the available convenience macros for adding fields.

Although we don't need to for blogs, it's possible to add extra Apostrophe areas and singletons (standalone widgets of a fixed type) to any snippet. You can do that with the `snippetSingleton` and `snippetArea` macros, as seen here:

```twig
{{ snippetSingleton('thumbnail', 'Thumbnail') }}
{{ snippetArea('body', 'Body') }}
```

The real work of initializing these takes place in browser-side JavaScript.

Note that we don't have to explicitly add these properties to `edit.html` as it extends `new.html`.

### Sending Extra Properties to the Server: Subclassing on the Browser Side ### <a id="browser-subclassing"></a>

*NOTE: you can skip this if you use the `addFields` option as described earlier.*

Next we'll need to send our extra properties to the server when a snippet is saved. Until this point all of the code we've looked at has been on the server side. But of course snippets also have browser-side JavaScript code to implement the "new," "edit" and "manage" dialogs. You can find that code in `apostrophe-snippets/public/js/editor.js`.

Just like the server side code, this browser side code can be subclassed and extended. In fact, we must extend it for our new subclass of snippets to work. Here's how to do that:

1. Create a `public` folder in your module. This is where static assets meant to be served to the browser will live for your module.

2. Create a `js` subdirectory of that folder for your browser-side JavaScript files.

3. Create an `editor.js` file and a `content.js` file in that folder.

`editor.js` will house all of the logic for subclassing snippets and is only loaded in the browser if a user is logged in. `content.js` is always loaded, giving us a convenient way to split up the logic between the _editing_ interface of the blog and the javascript related to showing it. We won't be making use of `content.js` for our Blog, but if we were making a widget such as a slideshow that required some logic this is where we would put it.

Here's what `editor.js` looks like for the blog module:

```javascript
function AposBlog(optionsArg) {
  ...
}

AposBlog.addWidgetType = function(options) {
  ...
}
```

Here we have two things: a constructor to create the module's browser-side JavaScript object, and a separate function to add a new widget to the site for reusing articles. *Since we have a distinct instance type, we must have a distinct widget too if we want to display blog posts via widgets.*

The `AposBlog` constructor's name is not an accident. `Apos` (or apos, for anything that is not a constructor) is the reserved prefix for Apostrophe-related variables on the browser side. The snippet module's server-side code will automatically push a JavaScript call into a block of browser-side calls at the end of the `body` element that creates and initializes the browser-side object for us.

By default, if the `name` option of our module is `blog`, the server will push a call to create an `AposBlog` object, passing it many of the same options the server side object receives:

```javascript
new AposBlog({ name: 'blog', instance: 'blogPost', css: 'blog-post', typeCss: 'blog', ... })
```

The `css` property is a CSS-friendly name for the instance type. The `typeCss` property is a CSS-friendly name for the index page type. These CSS-friendly names are very useful when manipulating DOM elements with jQuery.

However, *please do not use the Apos prefix or the `apostrophe-` prefix for your own modules*. Just to avoid confusion, we ask that third-party developers use their own prefix. You don't want your code to stop working when we release a module of the same name. We don't even use the prefix ourselves if we are writing project-specific code that won't be published in the npm repository.

"But if I use my own prefix, how will the server push the right call to construct my object?" Good question. You can fix that by adding one more property when you initialize your module on the server side as shown earlier:

```javascript
_.defaults(options, {
  instance: 'blogPost',
  name: options.name || 'blog',
  ...
  browser: {
    construct: 'MyBlog'
  }
});
```

Now the server will push a call to create a `MyBlog' object instead.

But we still haven't seen how extra properties of a snippet are handled. So let's look at that code from `editor.js` in the blog module.

```javascript
var superBeforeSave = self.beforeSave;

self.beforeSave = function($el, data, callback) {
  data.publicationDate = $el.find('[name="publication-date"]').val();
  return superBeforeSave($el, data, callback);
}
```

 `$el` is a jQuery reference to the modal dialog in which the blog post is being edited or created.

*IMPORTANT: we ALWAYS use `$el.find` to locate the field we want within the context of the dialog. We NEVER use `$('[name="our-field"]')`. Otherwise your code WILL eventually conflict with unrelated code. Scope is a good thing.*

Again, if you need to treat new and updated snippets differently, you can write separate `beforeInsert` and `beforeUpdate` methods.

We also need to initialize these fields when the dialog is first displayed. We do that by extending the `afterPopulatingEditor` method. Note the use of the `super` technique to invoke the original version. We'll let the original version invoke the callback when it's done:

```javascript
var superAfterPopulatingEditor = self.afterPopulatingEditor;
self.afterPopulatingEditor = function($el, snippet, callback) {
  $el.find('[name="publication-date"]').val(snippet.publicationDate);
  return superAfterPopulatingEditor.call(self, $el, snippet, callback);
};
```

*"Great, but what about areas in snippets?"* Good question. It's all well and good to expect you to just call `.val()` on a jQuery object for a text field or a select element, but Apostrophe areas are a different animal. Fortunately there are conveniences to help you.

Let's set up an additional area called `parking`. We'll need a call in `afterPopulatingEditor`:

```javascript
self.enableArea($el, 'parking', snippet.areas.parking, function() {
  return superAfterPopulatingEditor($el, snippet, callback);
});
```

The second argument is the field name as passed to the `snippetArea` macro. The third is the area object in the snippet (which may not exist yet; that's OK). And the last is a callback to be invoked when the area is ready. We should do the rest of our work in that callback.

Here we have no further areas to initialize so we invoke the `superAfterPopulatingEditor` from the callback for this area.

We also need to add our custom area to the `findExtraFields` function:

```javascript
data.parking = self.getAreaJSON($el, 'parking');
```

As the name implies, this method converts the area to a JSON string ready to send to the server.

### Other methods to consider overriding on the browser side ### <a id="browser-other-methods"></a>

There are other methods you can override or extend. `addingToManager` is called before a snippet is added to the "manage blog posts" list view. The blog module overrides this method to add the publication date and tags of the snippet to fields that have been customized in each row of the `manage.html` template. (Note this method does not take a callback, as a reminder to keep it light and fast; loading something asynchronously for every row in the list view is just too slow.)

```javascript
  self.addingToManager = function($el, $snippet, snippet) {
    $snippet.find('[data-date]').text(snippet.publicationDate);
    if (snippet.tags !== null) {
      $snippet.find('[data-tags]').text(snippet.tags);
    }
  };
```

### Manipulating snippet objects in the database ### <a id="manipulating-snippets"></a>

The following methods are convenient for manipulating snippet objects:

`self.get(req, criteria, options, callback)`, as described earlier, retrieves snippets.
`self.putOne(req, oldSlug, snippet, callback)` inserts or updates a single snippet. If you are not potentially changing the slug you can skip the `oldSlug` argument.

These methods respect the permissions of the current user and won't allow the user to do things they are not allowed to do. They should be used in preference to directly manipulating the `self._apos.pages` collection in most cases.

The `self.putOne` method also invokes a `self.beforePutOne` method, which always receives the parameters `req, oldSlug, snippet, callback`. This is a convenient point at which to update denormalized copies of properties. This method is different from `beforeSave` in that it should be used for all operations in which you want to update a snippet, not just when a user is editing one via the "Manage Snippets" dialog.

### Pushing our JavaScript and CSS assets to the browser ### <a id="pushing-assets"></a>

Great, but how do our `editor.js` and `content.js` files make it to the browser? And what about the various templates that are instantiated on the browser side to display modals like "New Blog Post" and "Manage Blog Posts?"

The answer is that the snippet module pushes them there for us:

```javascript
self.pushAsset('script', 'editor');
self.pushAsset('stylesheet', 'editor');
self.pushAsset('script', 'content');
self.pushAsset('stylesheet', 'content');
self.pushAsset('template', 'new');
self.pushAsset('template', 'edit');
self.pushAsset('template', 'manage');
self.pushAsset('template', 'import');
```

As explained in the documentation of the main `apostrophe` module, the `pushAsset` call schedules scripts, stylesheets and templates to be "pushed" to the browser when building a complete webpage. Scripts and stylesheets are typically minified together in production, and templates that are pushed to the browser in this way are hidden at the end of the `body` element where they can be cloned when they are needed by the `apos.fromTemplate` method. And since we specified our own directory when setting up the `dirs` option, our versions of these files are found first.

So you don't need to worry about delivering any of the above files (`editor.js`, `editor.less`, `content.js`, `content.less`, `new.html`, `edit.html`, `manage.html`, and `import.html`). But if you wish to push additional browser-side assets as part of every page request, now you know how.

### Saving Extra Properties on the Server ### <a id="saving-extra-properties"></a>

Now that we've introduced extra properties, and seen to it that they will be included when a new blog post is sent to the server, we need to enhance our server-side code a little to receive them.

The server-side code in `apostrophe-blog/index.js` is very similar to the code we saw in the browser.

We can store our new properties via the `self.beforeSave` method:

```javascript
var superBeforeSave = self.beforeSave;

self.beforeSave = function(data, snippet, callback) {
  snippet.publicationDate = self._apos.sanitizeDate(data.publicationDate, snippet.publicationDate);
  return superBeforeSave(data, snippet, callback);
}
```

If you need to treat new and updated snippets differently, you can override `beforeInsert` and `beforeUpdate`.

Notice that we call the original version of the `beforeSave` method from our superclass. Although `apostrophe-snippets` itself keeps this method empty as a convenience for overrides, if you are subclassing anything else, like the blog or events modules, it is critical to call the superclass version. So it's best to stay in the habit.

Note the use of the `apos.sanitizeDate` method. The `apostrophe` module offers a number of handy methods for sanitizing input. The `sanitize` npm module is also helpful in this area. Always remember that you cannot trust a web browser to submit valid, safe, correct input.

*Apostrophe's philosophy is to sanitize input rather than validating it.* If the user enters something incorrect, substitute something reasonable and safe; don't force them to stop and stare at a validation error. Or if you must do that, do it in browser-side JavaScript to save time. Is the slug a duplicate of another snippet's slug? Modify it. (We already do this for you.) Is the title blank? Provide one. (We do this too.)

"What about areas?" In our earlier example we introduced an Apostrophe content area named `parking` as part of a snippet. Here's how to sanitize and store that on the server side:

```javascript
// Transportation is an area, ask snippet/index.js to process it for us automatically
self.convertFields.push({ type: 'area', name: 'transportation' });
```

*Important:* you don't need to do this as part of your `self.beforeSave` override. You register it just once in your constructor, after calling the snippet module constructor that provides the service.

Always keep in mind that most fields don't need to be integrated into a `beforeSave` method and can just be implemented using the `addFields` schema feature.

### Extending the `get` method to support custom criteria ### <a id="extending-get"></a>

So far, so good. But what if we want to limit the blog posts that appear on the index page to those whose publication date has already passed? While we're at it, can't we put the blog posts in the traditional descending order by publication date?

Those are very reasonable requests. Here's how to do it. Once again we'll use the `super` pattern to extend the existing method:

```javascript
// Establish the default sort order for blog posts
var superGet = self.get;

self.get = function(req, optionsArg, callback) {
  var options = {};

  extend(options, optionsArg || {}, true);

  if (options.publicationDate === 'any') {
    delete options.publicationDate;
  } else if (!options.publicationDate) {
    options.publicationDate = { $lte: moment().format('YYYY-MM-DD') };
  } else {
    // Custom criteria were passed for publicationDate
  }

  if (!options.sort) {
    options.sort = { publicationDate: -1 };
  }
  return superGet.call(self, req, options, callback);
};
```

The `get` method accepts an `options` argument, an object which eventually becomes a set of criteria to be passed as the first argument to a MongoDB `find()` call. Here we start by coping the entire `options` object with the `extend` function, which is available via the `extend` npm module.

"Hang on a second! Why are we copying the options?" Because we're going to change them. And when you pass an object in JavaScript, you're *not copying it*. Which means that if you modify it, *the original is modified*. And the code that's calling our function might not like that. So we copy the options before we start to alter them.

We begin by checking for a special case: if `publicationDate` is set to `any`, we actually do want to see unpublished blog posts. So we remove the property from the `options` object so it doesn't get passed to MongoDB. This option is used when implementing the admin interface, as you'll see below.

Next we set up the default behavior: if no `publicationDate` option has already been specified, we set it up as a MongoDB query for dates prior to or equal to today's date. (See the documentation of the `moment` npm module, used here to format a date in the correct way to compare it to our publication dates.)

Finally, if no sorting criteria have already been specified, we specify a sort in reverse order by publication date (the traditional order for a blog).

Finally we invoke the original version of the `get` method.

### When the `manage` dialog and the public should see different things ### <a id="adding-manage-criteria"></a>

An editor managing blog posts through the "Manage Blog Posts" dialog needs to see slightly different things than a member of the public. For instance, they should see posts whose publication date has not yet arrived.

The snippets module provides an `addApiCriteria` method for adding special criteria only when an API is being called. This allows us to treat requests for blog posts made by the "Manage Blog Posts" dialog differently:

```javascript
var superAddApiCriteria = self.addApiCriteria;
self.addApiCriteria = function(query, criteria) {
  superAddApiCriteria.call(self, query, criteria);
  criteria.publicationDate = 'any';
};
```

Here we extend `addApiCriteria` to explicitly include posts whose publication date has not yet arrived. Since this method is invoked for us before `get` is called to populate the "Manage Blog Posts" dialog, we'll see the additional posts that haven't been shared with the world yet.

### When Two Page Types Have the Same Instance Type ### <a id="two-pages"></a>

"Great, now I know how to subclass snippets in a big way. But all I want to do is present blog posts a little differently if my user picks the 'press releases' page type. What's the absolute minimum I have to do?"

Fair question. You still need to subclass snippets (or, in this case, subclass the blog which is a subclass of snippets; it works the same way). But you don't have to do everything. Here's how we subclass the blog module in one of our projects to introduce a separate page type for "press releases." All we wanted was an index page that displays regualr blog posts a little bit differently:

```javascript
// First initialize the blog. You must do this first. These functions are called in sequence via async.series

function initAposBlog(callback) {
  blog = require('apostrophe-blog')({
    apos: apos,
    pages: pages,
    app: app,
    widget: true,
    dirs: [ __dirname+'/overrides/apostrophe-blog' ]
  }, callback);
}

// Now initialize press releases

function initAposPressReleases(callback) {
  pressReleases = require('./lib/modules/pressReleases/index.js')({
    apos: apos,
    pages: pages,
    app: app,
    widget: true,
    dirs: [ __dirname+'/lib/modules/pressReleases/views' ],
    browser: {
      construct: 'PressReleases'
    },
    // No special widget for press releases
    widget: false
  }, callback);
}
```

Here's `lib/modules/pressReleases/index.js`:

```javascript
var _ = require('underscore');
var blog = require('apostrophe-blog');

module.exports = pressReleases;

function pressReleases(options, callback) {
  return new pressReleases.PressReleases(options, callback);
}

pressReleases.PressReleases = function(options, callback) {
  var self = this;
  _.defaults(options, {
    instance: 'blogPost',
    name: options.name || 'pressReleases',
    label: options.name || 'Press Releases',
    icon: false,
    webAssetDir: __dirname
  });

  blog.Blog.call(this, options, null);

  if (callback) {
    process.nextTick(function() { return callback(null); });
  }
};
```

Don't forget to register the page loader function in `app.js` where you configure the `apostrophe-pages` module:

```javascript
load: [
  ...
  snippets.loader,
  blog.loader,
  pressReleases.loader
]
```

We also need a bare-bones `lib/modules/pressReleases/public/js/editor.js` file on the browser side:

```javascript
function PressReleases(options) {
  var self = this;
  AposBlog.call(self, options);
}
```

That's it! Now we can copy the regular blog module `index.html` and `show.html` files to our module's `views` folder and modify them as much as we like. If the user picks "Press Releases" rather than "Blog," they'll see our customized treatment of the index and show pages. Since we are using the same instance type as the regular "Blog" page type, we don't have to provide a new admin menu or a separate snippet for reuse around the site.

### RSS Feed Options ### <a id="rss-feed"></a>

The RSS feed feature can be configured via the `feed` option when configuring the module.

To shut off the feed entirely for snippets or any subclass of snippets, set `feed` to `false`.

The following additional options are supported. Note that the title of the feed is normally set quite well already based on the title of your site (if you are using `apostrophe-site`) and the title of the index page.

```javascript
feed: {
  // Separates the site title and the page title to autogenerate a feed title
  titleSeparator: ' - ',

  // Hard code the title of the feed
  title: 'This is the title of the feed, no matter what',

  // Change the prefix but still append the page title after that
  titlePrefix: 'Prepend this to the title of the page to title the feed: ',

  // By default we show the thumbnail, if the snippet has one
  thumbnail: true,

  // By default we show the first image in the body, if the snippet has no thumbnail
  alternateThumbnail: true,

  // By default we show the rich text of a snippet in its entirety, although only one
  // image if any. If you set this true you'll get plaintext only
  summary: true,

  // By default we show the entire plaintext when summary is true. Use this option
  // to limit the character count
  characters: 1000
}
```

### Supporting More Feed Types, Customizing the Feed ### <a id="rss-feed-customizing"></a>

The following methods of the snippets module are involved. They are easy to subclass and extend to support more types of feeds:

`feedContentType`, `renderFeed`, `renderFeedItem`, `renderFeedItemDescription`

All of these receive the `req` object, so you can inspect `req.query.feed` to figure out what type of feed was asked for. THe standard templates that ship with the snippets module provide links to generate RSS feeds (`feed=rss`).

## Conclusion

Phew! That's a lot to chew on. But once you've digested it, you'll be able to create new content types in Apostrophe with very little work and as much code reuse as possible. That's a very cool thing.

We strongly recommend reading the documentation of the `apostrophe` and `apostrophe-pages` modules as well. There are no special privileges accorded to snippets in Apostrophe. Everything they offer is built on Apostrophe's modal templates, widgets, page storage capabilities and page loader functions.
