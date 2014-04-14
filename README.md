# apostrophe-snippets

**Table of Contents**
* [Using Snippets Directly](#using-snippets-directly)
  * [Overriding Snippet Templates](#overriding-snippet-templates)
  * [Inserting the Snippets Admin Menu](#inserting-the-snippets-admin-menu)
  * [Enabling Snippets As A Page Type](#enabling-snippets-as-a-page-type)
* [Creating Your Own Content Types](#creating-your-own-content-types-subclassing-snippets)
  * [Configuring New Content Types](#configuring-new-content-types)
  * [Custom Templates](#custom-templates)
  * [Adding New Properties To Your Snippets Using the Schema](#adding-new-properties-to-your-snippets-using-the-schema)
  * [Showing Custom Fields In The "Manage" View](#showing-custom-fields-in-the-manage-view)
  * [Blocking Search](#blocking-search)
  * [Restricting Edits To Admins Only](#restricting-edits-to-admins-only)
  * [Advanced Techniques: Overriding Methods in Your Subclass](#advanced-techniques-overriding-methods-in-your-subclass)
  * [Snippets = Pages Outside the Page Tree](#snippets--pages-outside-the-main-page-tree)
  * [Customizing the Dispatcher](#customizing-the-dispatcher-handling-urls-differently)
  * [How the `dispatch` Method Works](#how-the-dispatch-method-works)
  * [Extending the `dispatch` method](#extending-the-dispatch-method-without-overriding-it-completely)
* [Joins in Schemas](#joins-in-schemas)
  * [one-to-one](#one-to-one-joins)
  * [reverse](#reverse-joins)
  * [nested joins](#nested-joins-you-gotta-be-explicit)
  * [many-to-many](#many-to-many-joins)
  * [reverse many-to-many](#reverse-many-to-many-joins)
  * [Complicated Relationships](#when-relationships-get-complicated)
  * [Accessing Relationship Properties in a Reverse Join](#accessing-relationship-properties-in-a-reverse-join)
* [Custom Properties and Joins for Index Pages](#custom-properties-and-joins-for-index-pages)
* [Custom Properties Without Schemas](#adding-custom-properties-without-schemas)
* [Adding Properties to new and edit dialogs](#adding-properties-to-the-new-and-edit-dialogs)
* [Subclassing on the browser side](#sending-extra-properties-to-the-server-subclassing-on-the-browser-side)
  * [Other methods to consider overriding in the browser](#other-methods-to-consider-overriding-on-the-browser-side)
  * [Validating snippets](#validating-snippets)
  * [Extending the Widget](#extending-the-widget)
* [Manipulating Snippet Objects in the Database](#manipulating-snippet-objects-in-the-database)
* [Pushing JS and CSS Assets to the Browser](#pushing-our-javascript-and-css-assets-to-the-browser)
* [Saving Extra Properties on the Server](#saving-extra-properties-on-the-server)
* [Extending the Get Method](#extending-the-get-method-to-support-custom-criteria)
* [Adding Criteria to the Manage Dialog](#when-the-manage-dialog-and-the-public-should-see-different-things)
* [Two Pages with the same Instance Type](#when-two-page-types-have-the-same-instance-type)
* [RSS Feed Options](#rss-feed-options)
  * [Customizing the Feed](#supporting-more-feed-types-customizing-the-feed)

`apostrophe-snippets` adds a repository of reusable content snippets to the [Apostrophe](http://github.com/punkave/apostrophe) content management system. Just as important, `apostrophe-snippets` provides a base on which the `apostrophe-blog`, `apostrophe-events` and other modules are built, among other modules that introduce new types of content. One can add a page to the site that displays a collection of snippet titles in alphabetical order and click on these to access individual snippets at their own "permalink" URLs. The blog and events modules extend this behavior to achieve similar goals with a minimum of code duplication.

In addition, snippets can be inserted into any content area via the snippet widget. This is the most common direct use of the snippets module: inserting, for instance, driving directions in many places on the site, while maintaining the ability to edit that content in just one place.

So there are four main ways a snippet might appear to the end user:

* Via a *snippet widget*, which can be used to insert one or more snippets into any content area. The snippet widget appears as an icon in the content editor's toolbar. The snippet widget can also be used as a singleton (via `aposSingleton`). This is the most common direct use for the snippets module.
* On an *index page*, providing a way to browse many snippets, potentially filtered by tag. Snippet index pages are part of Apostrophe's page tree; you can change the type of any page to a "snippets" page via the "page settings" menu. You might use them to display a collection of related documents which don't fit into your tree of pages. You can lock down the snippets that will be displayed on a particular snippet index page by entering specific tags via "Page Settings" on the "Pages" menu. Although available directly, this feature is most often used in subclasses of snippets, such as the blog module.
* On a *show page*, featuring that snippet by itself at its own URL. As far as the `apostrophe-pages` module and Apostrophe's page tree are concerned, a "show page" is actually just an extension of an index page. The snippets module spots the slug of the index page in the URL, then takes the remainder of the URL and looks for a snippet with that slug. "Subclasses" of snippets, like the blog module, may easily alter the way the remainder of the URL is used to accommodate displaying a publication date in the URL.
* Via an RSS feed. Adding `?feed=rss` to the URL of a snippet index page automatically generates an RSS feed. Methods of the snippets module can be easily overridden and extended to support more feed types.

## Using Snippets Directly

Snippets are quite useful by themselves. Quite often, the snippet widget is enabled in a project to allow reuse of frequently-changing content displayed in a variety of places at the end user's discretion, rather than hardcoding a shared area or singleton into the page templates.

To enable snippets in a project, just add the `apostrophe-snippets` module to your `app.js` configuration:

```javascript
  modules: {
    'apostrophe-snippets': {},
    ... other modules ...
  }
```

(Here we assume you are using the [apostrophe-site](http://github.com/punkave/apostrophe-site) module to organize your project in `app.js`. You should be.)

### Overriding Snippet Templates

If you'd like to just create custom templates for the snippets module or one of its derivatives, you can create a project-specific override of that module. The current Apostrophe "best-practice" for this involves creating a top-level directory named "lib" (i.e. `/my-project/lib/`), and then creating custom versions of the template there (i.e. `/my-project/lib/modules/apostrophe-snippets`).

Your "project level overrides" will automatically be picked up as long as the folder you add to `lib/modules` has the same name as the npm module (`apostrophe-snippets`).

Now we can create a "views" directory in our `lib/modules/apostrophe-snippets` folder and customize the templates for our project (i.e. `/lib/modules/apostrophe-snippets/views/index.html`). You can copy any or all files from the "views" directory of the original module, but note that to add any extra fields or extend the functionality of the module, you'll need to subclass that particular snippet (or simply create your own content type). Read on below about subclassing a snippets module.

### Inserting the Snippets Admin Menu

The above code sets up snippets both as a page type (for creating snippet index pages) and as a widget, and also provides a "snippets" admin dropdown menu which can be included in your `outerLayout.html` template via the following nunjucks code:

```twig
{{ aposSnippetMenu({ edit: editSnippet }) }}
```

See `outerLayout.html` in the sandbox project for the best way of handling the admin menus.

### Enabling Snippets As A Page Type

To allow snippets to be publicly browsed via a page on your site, just make sure you include the page type `snippets` in your `pages` configuration in `app.js`:

```javascript
  pages: {
    types: [
      { name: 'default', label: 'Default (Two Column)' },
      { name: 'home', label: 'Home Page' },
      { name: 'snippets', label: 'Snippets' },
    ]
  }, ... more configuration ...
```

Most of the time you won't want to do this, since snippets are usually inserted into the middle of other pages instead, appearing like a natural part of it. But you'll do this quite often with other content types that are subclassed from snippets, like the blog and events modules.

## Creating Your Own Content Types: Subclassing Snippets

It's possible to create your own content types based on snippets. This has many advantages. All of the tools to manage snippets have already been built for you and are easily extended without code duplication to accommodate new content. The snippets module also implements an Apostrophe page loader function for you, ready to display "index pages" and "show pages" out of the box. And of course a widget for reusing snippets anywhere on the site is built in. All of this functionality is easily obtained for your new content type as well.

Absolutely nothing is preventing you from implementing your own page loader functions and your own admin tools for managing content, and sometimes this may be desirable. But in most cases subclassing snippets is the right way to go.

Subclasses of snippets can extend their behavior on both the server side and the browser side. Most of the job can be done simply through configuration in `app.js`, but you may need to extend the code on the server side as well to add custom features. And extra browser-side code is also desirable at times. We'll see below how to do both.

The `apostrophe-blog`, `apostrophe-events` and `apostrophe-map` modules are all simple subclasses of `apostrophe-snippets` and they make good examples if you wish to learn how to package your work as an npm module for the benefit of the community.

### Configuring New Content Types

You can create a new content type just by configuring it in `app.js` along with other modules. Let's invent a new content type called "stories:"

```javascript
modules: {
  ... other modules ...
  'stories': {
    extend: 'apostrophe-snippets',
    name: 'stories',
    label: 'Stories',
    instance: 'story',
    instanceLabel: 'Story',
    addFields: [
      {
        name: 'year',
        type: 'integer',
        label: 'Year',
        def: '2013'
      },
      {
        name: 'publisher',
        type: 'string',
        label: 'Publisher',
      }
    ]
  }
}
```

The `extend` property tells Apostrophe what module you're subclassing. You can subclass `apostrophe-blog` or `apostrophe-events` instead if they are closer to what you need.

The `instance` property is a singular word for one item - one story, in this case. `name` is a name for data type as a whole and is usually plural (like "snippets" or "events" or "blog"). `label` and `instanceLabel` are publicly visible versions of these and should be capitalized.

`addFields` allows us to add new fields to our content type. We'll examine it in more detail below.

**You must also create `lib/modules/stories` in your project.** Soon we'll add custom templates there, but it must exist even before you do that.

**Edit `outerLayout.html`** and add a line to insert the menu for managing stories:

```jinja2
  {{ aposStoryMenu({ edit: permissions.admin }) }}
```

And... that's actually enough to get started! With just this much code, you can already create, edit and manage stories, including the custom fields `year` and `publisher`. All the plumbing is automatic. Nice, yes?

### Custom Templates

Your code automatically inherits its templates from the snippets module. But the bare-bones templates we supply for the `index` and `show` views of snippets are not very exciting. So, create your own! Just copy those templates to `lib/modules/stories/views/index.html` and `lib/modules/stories/views/show.html` and modify them as you see fit.

We recommend creating your own, additional `storyMacros.html` file and including it in your templates. *Don't override snippetMacros.html in your module*. We frequently improve that file and you don't want to lose access to those improvements.

### Adding New Properties To Your Snippets Using the Schema

*There is a very easy way to do this.* Snippets now support a simple JSON format for creating a schema of fields. Both the browser side and the server side understand this, so all you have to do is add them to the dialogs as described below and set up the schema. You can still do it the hard way, however, if you need custom behavior.

Here is a super-simple example of a project-level subclass of the people module (itself a subclass of snippets) that adds new fields painlessly. Here I assume you are using `apostrophe-site` to configure your site (you should be).

```javascript
... Configuring other modules ...
'apostrophe-people': {
  addFields: [
    {
      name: 'workPhone',
      type: 'string',
      label: 'Work Phone'
    },
    {
      name: 'workFax',
      type: 'string',
      label: 'Work Fax'
    },
    {
      name: 'department',
      type: 'string',
      label: 'Department'
    },
    {
      name: 'isRetired',
      type: 'boolean',
      label: 'Is Retired'
    },
    {
      name: 'isGraduate',
      type: 'boolean',
      label: 'Is Graduate'
    },
    {
      name: 'classOf',
      type: 'string',
      label: 'Class Of'
    },
    {
      name: 'location',
      type: 'string',
      label: 'Location'
    }
  ]
}, ... more modules ...
```

### What Field Types Are Available?

Currently:

`string`, `boolean`, `integer`, `float`, `select`, `url`, `date`, `time`, `slug`, `tags`, `password`, `area`, `singleton`

Except for `area`, all of these types accept a `def` option which provides a default value if the field's value is not specified.

The `integer` and `float` types also accept `min` and `max` options and automatically clamp values to stay in that range.

The `select` type accepts a `choices` option which should contain an array of objects with `value` and `label` properties.

The `date` type pops up a jQuery UI datepicker when clicked on, and the `time` type tolerates many different ways of entering the time, like "1pm" or "1:00pm" and "13:00".

The `url` field type is tolerant of mistakes like leaving off `http:`.

The `password` field type stores a salted hash of the password via `apos.hashPassword` which can be checked later with the `password-hash` module. If the user enters nothing the existing password is not updated.

When using the `area` and `singleton` types, you may include an `options` property which will be passed to that area or singleton exactly as if you were passing it to `aposArea` or `aposSingleton`.

When using the `singleton` type, you must always specify `widgetType` to indicate what type of widget should appear.

Joins are also supported as described below.

### Removing Fields

Two fields come standard with snippets: `thumbnail` and `body`. `thumbnail` is a singleton with widget type `slideshow`, and `body` is an area.

If either of these is of no use to you, just remove it:

```javascript
'my-own-thing': {
  removeFields: [ 'thumbnail', 'body' ]
}
```

### Changing the Order of Fields

When adding fields, you can specify where you want them to appear relative to existing fields via the `before`, `after`, `start` and `end` options:

```javascript
addFields: [
  {
    name: 'favoriteCookie',
    type: 'string',
    label: 'Favorite Cookie',
    after: 'title'
  }
]
```

Any additional fields after `favoriteCookie` will be inserted with it, following the title field.

Use the `before` option instead of `after` to cause a field to appear before another field.

Use `start: true` to cause a field to appear at the top.

Use `start: end` to cause a field to appear at the end.

If this is not enough, you can explicitly change the order of the fields with `orderFields`:

```javascript
'apostrophe-people': {
  orderFields: [ 'year', 'specialness' ]
}
```

Any fields you do not specify will appear in the original order, after the last field you do specify (use `removeFields` if you want a field to go away).

### Altering Fields: The Easy Way

It's easy to replace a field that already exists, such as the "body" field, for instance in order to change its type. Just pass it to `addFields` with the same name as the existing field:

```javascript
'my-own-thing': {
  addFields: [
    {
      name: 'body',
      type: 'string',
      label: 'Body'
    }
  ]
}
```

#### Altering Fields: The Hard Way

There is also an `alterFields` option available. This must be a function which receives the fields array as its argument and modifies it. Most of the time you will not need this option; see `removeFields`, `addFields` and `orderFields`. It is mostly useful if you want to make one small change to a field that is already rather complicated. Note you must modify the existing array of fields in place.

### Adding Properties to the New and Edit Dialogs

This is not your problem! The latest versions of the `new.html` and `edit.html` templates invoke `snippetAllFields`, a macro which outputs all of the fields in your schema, in order.

However, if you want to, or you need to because you are implementing extra fields without using the schema, then you can copy `new.html` to `lib/modules/modulename/views/new.html`. Since your template starts by extending the `newBase.html` template, you can be selective and just override the `insideForm` block to do something a little different with the fields, but not rewrite the entire template:

```jinja2
{% block insideForm %}
{{ snippetAllFields(fields, { before: 'shoeSize' }) }}
<p>Here comes the shoe size kids!</p>
{{ snippetText('shoeSize', 'Shoe Size') }}
<p>Wasn't that great?</p>
{{ snippetAllFields(fields, { from: 'shoeSize' }) }}
{% endblock %}
```

See `snippetMacros.html` for all the macros available to render different types of fields.

This example code outputs most of the fields in a long schema, then outputs one field directly, then outputs the rest of the fields.

In addition to `before` and `from`, you may also use `after` and `to`. `before` and `after` are exclusive, while `from` and `to` are inclusive. Combining `before` and `from` let us wrap something around a specific field without messing up other fields or even having to know what they are.

Of course you can also override `new.html` completely from scratch, provided you produce markup with the same data attributes and field names.

You usually won't need to touch `edit.html` because it gracefully extends whatever you do in `new.html`.

Note that the name of each property must match the name you gave it in the schema. weLikeMongoDb, soPleaseUseIntercap, not-hyphens_or_underscores.

Note that you do not need to supply any arguments that can be inferred from the schema, such as the `choices` list for a `select` property, or the widget type of a singleton. The real initialization work happens in browser-side JavaScript powered by the schema.

#### Search and Schema Fields

By default, all schema fields of type `string`, `select`, `area` and (in certain cases) `singleton` are included in the search index. You can shut this off by setting the `search` option to `false` for a particular field. You can also reduce the search index weight of the field by setting `weight` to a lower value. The built-in search engine prioritizes results with a weight greater than `10` over "plain old rich text." By default the weight for schema fields is `15`.

Actually displaying your field as part of the summary shown when a snippet qualifies as a search result is usually not desirable, so by default this is not done. However you can include it in the summary text by setting the `silent` option to `false`.

### Custom Field Types

You can define custom field types to be included in schemas. For this advanced topic, see the [apostrophe-schemas](http://github.com/punkave/apostrophe-schemas) documentation. The `apostrophe-snippets` module is based upon `apostrophe-schemas`, so everything that can be done there is also supported with snippets.

### Joins in Schemas

You may use the `join` type to automatically pull in related objects from this or another module. Typical examples include fetching events at a map location, or people in a group. This is very cool.

*"Aren't joins bad? I read that joins were bad in some NoSQL article."*

Short answer: no.

Long answer: sometimes. Mostly in so-called "webscale" projects, which have nothing to do with 99% of websites. If you are building the next Facebook you probably know that, and you'll denormalize your data instead and deal with all the fascinating bugs that come with maintaining two copies of everything.

Of course you have to be smart about how you use joins, and we've included options that help with that.

##### One-To-One Joins

In your configuration for the events module, you might write this:

```javascript
'apostrophe-events': {
  addFields: [
    {
      name: '_location',
      type: 'joinByOne',
      withType: 'mapLocation',
      idField: 'locationId',
      label: 'Location'
    }
  ]
}
```

As with other schema fields, **we do not have to add them to `new.html`**. `snippetAllFields` will cover it. You can use the `placeholder` option when configuring the field to adjust the text displayed in the autocomplete text field.

However, *if you wish to output a join field directly yourself*, you should do it like this:

```twig
{{ snippetSelective('_location', 'Location') }}
```

Now the user can pick a map location for an event. And anywhere the event is used on the site, you'll be able to access the map location as the `_location` property. Here's an example of using it in a Nunjucks template:

```twig
{% if item._location %}
  <a href="{{ item._location.url | e }}">Location: {{ item._location.title | e }}</a>
{% endif %}
```

The id of the map location "lives" in the `location_id` property of each event, but you won't have to deal with that directly.

*Always give your joins a name starting with an underscore.* This warns Apostrophe not to store this information in the database permanently where it will just take up space, then get re-joined every time anyway.

##### Reverse Joins

This is awesome. But what about the map module? Can we see all the events in a map location?

Yup:

```javascript
'apostrophe-map': {
  addFields: [
    {
      name: '_events',
      type: 'joinByOneReverse',
      withType: 'event',
      idField: 'locationId',
      label: 'Events'
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

##### Nested Joins: You Gotta Be Explicit

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

#### Many-To-Many Joins

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
      sortable: true,
      label: 'Stories'
    }
  ],
}
```

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
      ifOnlyOne: true,
      label: 'Books'
    }
  ]
}
```

Now any call to fetch books that retrieves only one object will carry out the join with stories. Any call that returns more than one object won't. You don't have to specifically call `books.getOne` rather than `books.get`.

Hint: in index views of many objects, consider using AJAX to load related objects when the user indicates interest if you don't want to navigate to a new URL in the browser.

#### Reverse Many-To-Many Joins

We can also access the books from the story if we set the join up in the stories module as well:

```javascript
'stories': {
  ... other needed configuration, probably subclassing snippets ...
  addFields: [
    {
      name: '_books',
      type: 'joinByArrayReverse',
      withType: 'book',
      idsField: 'storyIds',
      label: 'Books'
    }
  ]
}
```

Now we can access the `._books` property for any story. But users still must select stories when editing books, not the other way around.

#### When Relationships Get Complicated

What if each story comes with an author's note that is specific to each book? That's not a property of the book, or the story. It's a property of *the relationship between the book and the story*.

If the author's note for every each appearance of each story has to be super-fancy, with rich text and images, then you should make a new module that subclasses snippets in its own right and just join both books and stories to that new module.

But if the relationship just has a few simple attributes, there is an easier way:

```javascript
'books': {
  ... other needed configuration, probably subclassing snippets ...
  addFields: [
    {
      name: '_stories',
      label: 'Stories',
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

#### Accessing Relationship Properties in a Reverse Join

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

### More About Schemas

Schemas in snippets are built upon the [apostrophe-schemas](http://github.com/punkave/apostrophe-schemas) module. For even more information about schemas check out the documentation for that module.

### Showing Custom Fields In The "Manage" View

By default the "manage" view shows only the title, the tags, and whether the item is currently in the trash or not.

You can extend this by setting the `manage: true` property on your fields and overriding the `manage.html` template. You'll need to copy that template from the `views/manage.html` file of the `apostrophe-snippets` module to the corresponding location for your module, which might be `lib/modules/myThing/views/manage.html`.

In the `manage.html` template, just include additional table cells for each row, like this one:

        <td><span data-key>Sample Key</span></td>

If there is a schema field named `key`, then its value will be displayed in this span.

The data attribute name `always-uses-hyphens`, `neverEverIntercap` `or_underscores`.

This feature is currently available for fields that correspond to simple form elements, like `boolean`, `string`, `date`, `time` and `select`. It is not currently available for joins, areas or singletons. It may become available for certain singletons (like thumbnails) and one-to-one joins in the future.

### Blocking Search

By default your content type is searchable. This is great, but sometimes you won't want it to be. To achieve that, set the `searchable: false` option when configuring your module.

### Restricting Edits To Admins Only

Sometimes your content type is too important to allow anyone except a site-wide admin permission to edit it. In such cases, just set the `adminOnly: true` option.

### Advanced Techniques: Overriding Methods in Your Subclass

It's surprising how much you can do with just `app.js` configuration and a few overridden templates. But sometimes you'll want to go beyond that. Maybe you need more than just `index` and `show` views of your content type. Or maybe you need to enhance the criteria by which items are fetched from MongoDB, adding more filters for instance.

To do so, you'll need to add a `/lib/modules/stories/index.js` file, in which you implement a manager object for your content type. Fortunately this isn't hard, because we provide tools to make it easier to subclass the manager object of `apostrophe-snippets`.

A bare-bones `index.js` looks like this:

```javascript
module.exports = stories;

function stories(options, callback) {
  return new stories.Stories(options, callback);
}

stories.Stories = function(options, callback) {
  var self = this;

  module.exports.Super.call(this, options, null);

  if (callback) {
    process.nextTick(function() { return callback(null); });
  }
};
```

This is just enough code to:

* Provide a "factory function" that creates our manager object
* Provide a constructor for the manager object
* Save `this` in a variable called `self` inside our closure, so we can always find the right `this` in callbacks
* Invoke the constructor of the superclass via `module.exports.Super`
* Invoke a callback to allow Apostrophe to continue starting up.

*Before* the `module.exports.Super` call, you may modify the `options` object. Typically you'll just set your options in `app.js`, but you may find it convenient to modify them here.

*If you are writing an npm module to share with the community*, you'll need to explicitly require your superclass module and invoke its constructor. `module.exports.Super` is a special convenience that only works at project level. Check out how the blog module does it.*

*After* the `module.exports.Super` call, but *before* the callback, you can override methods. And we'll look at examples of that in a moment.

### Snippets = pages outside the main page tree

This is a good time to mention how snippets are actually stored. Snippets are really nothing more than objects in the `aposPages` MongoDB collection, with the `type` property set to `snippet` (the `instance` property of the content type) and a slug that *does not* begin with a `/`, so that they don't appear directly as part of the page tree. Since they exist outside of the page tree, they don't have `rank` or `path` properties. In other respects, though, they are much like regular pages, which means they have a `title` property and an `areas` property containing rich content areas as subproperties. In addition, they can have properties that are unique to snippets.

Since snippets are pages, we can leverage all the capabilities already baked into Apostrophe to manage pages. In particular, the `getPage` and `putPage` methods are used to retrieve and store pages. Those methods check permissions, take care of version control, implement search indexing and perform other tasks common to snippets and regular pages.

### Customizing the dispatcher: handling URLs differently

By default, a snippet index page shows an index of snippets when it is accessed directly. And it shows individual snippets if the rest of the URL, after the slug of the snippet index page, matches the slug of the snippet. It looks like this:

http://mysite.com/policies/parties

Where "/policies" is the slug of a blog index page that the user has added to the page tree, and "parties" is the slug of an individual snippet. (Policies are a rather common use case for directly using snippet index pages on a site.)

### How the `dispatch` method works

The snippet module has a `dispatch` method that figures this out. All that method really does is:

1. Look at `req.remainder`, which contains the rest of the URL following the URL of the page itself. This will be an empty string if the visitor is looking at the index page itself.

2. Decide whether to serve an index page, a show page, or something else unique to your module's purpose.

3. Store any extra variables you wish to pass to the template you'll be rendering as properties of the `req.extras` object. This is how you'll pass your snippet or snippets to your template after fetching them. Typically the dispatcher calls the `get` method of the snippet module to fetch snippets according to criteria taken from the page settings as well as the query string or portions of the URL. Extending the `get` method is very common and provides a way to add additional criteria that can be used together with the built-in criteria for snippets, such as tags. The `get` method also takes care of permissions, widget loader functions, and other things you really don't want to reinvent. And the `get` method provides not just the snippets but also a list of distinct tags that appear among that collection of snippets. The `get` method also implements pagination, together with the default dispatcher and the `addCriteria` method. So we strongly recommend extending `get` rather than querying MongoDB yourself in most cases.

4. Set `req.template` to a function that will render the content of the response when passed the same data that is normally provided to a page template, such as `slug`, `page` (the index page object), `tabs`, `ancestors`, `peers`, etc. Fortunately the snippets module provides a handy `renderer` method for this purpose. So if you want to render the `show.html` template in the `views` subdirectory of your module, you can just write:

```javascript
req.template = self.renderer('show');
```

You can also set `req.notfound = true;` if appropriate, for instance if the URL looks like a show page but there is no actual snippet that maches the URL.

### Extending the `dispatch` method without overriding it completely

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

This is an important technique because in many cases we do need the default behavior of the original method and we don't want to completely override it. When you completely override something you become responsible for keeping track of any changes in the original method. **It's better to override as little as possible.**

### Custom Properties and Joins for Index Pages

So far we've added properties to snippets themselves... such as blog posts and events.

But what about the "blog" and "events" index pages that display them? It is sometimes useful to add properties to these too.

You can do that by passing the `indexSchema` option when you configure the module in `app.js`. You can pass `addFields`, `removeFields`, `orderFields` and `alterFields` properties, exactly as you would when adding properties to snippets.

You may use joins as well. In fact, there is no reason you can't join "index" types with "instance" types and vice versa.

Index pages carry out their joins when the page is visited, so if you decide to join an events page with mapLocations, you can display your chosen locations on the events page.

It is also possible to fetch all the index pages of a particular index type programmatically:

    snippets.getIndexes(req, criteria, options, callback)

Your callback receives an error if any, and if no error, an array of index pages. Joins are carried out according to the schema.

### Adding Custom Properties To Snippets Without Schemas

Here's an example of adding a property to a snippet without using the schema mechanism. This is useful if you need to support something not covered by schemas, although since custom schema types can be added, the chances are good you won't need this more direct approach.

Blog posts have a property that regular snippets don't: a publication date. A blog post should not appear before its publication date. To implement that, we need to address several things:

1. Editing that property, as part of the `new.html` and `edit.html` dialogs. Do this just as you would for a property implemented via the schema as described above.

2. Sending that property to the server, via browser-side JavaScript as shown below.

3. Saving the property on the server, by extending the `beforeSave` method on the server side, or `beforeInsert` and `beforeUpdate` if you need to treat new and updated snippets differently.

4. Making that property part of our criteria for fetching snippets, by extending the `get` method of the snippets module.

### Sending Extra Properties to the Server: Subclassing on the Browser Side

*NOTE: you can skip this if you are using schemas. You really want to use schemas if they support your field type.*

Next we'll need to send our extra properties to the server when a snippet is saved. Until this point all of the code we've looked at has been on the server side. But of course snippets also have browser-side JavaScript code to implement the "new," "edit" and "manage" dialogs. You can find that code in `apostrophe-snippets/public/js/editor.js`.

Just like the server side code, this browser side code can be subclassed and extended. In fact, we must extend it for our new subclass of snippets to work. Here's how to do that:

1. Create a `public` folder in your module. This is where static assets meant to be served to the browser will live for your module.

2. Create a `js` subdirectory of that folder for your browser-side JavaScript files.

3. Create an `editor.js` file and a `content.js` file in that folder.

`editor.js` will house all of the logic for subclassing snippets and is only loaded in the browser if a user is logged in. `content.js` is always loaded, giving us a convenient way to split up the logic between the _editing_ interface of the blog and the javascript related to showing it. We won't be making use of `content.js` for our Blog, but if we were making a widget such as a slideshow that required some logic this is where we would put it.

Here's what `editor.js` looks like in the simplest case in which you have one at all:

```javascript
function Stories(options) {
  var self = this;
  AposSnippets.call(self, options);
  // Override some methods of snippets/editor.js here
}
```

Here we have a constructor to create the module's browser-side manager object.

The snippet module's server-side code will automatically push a JavaScript call into a block of browser-side calls at the end of the `body` element that creates and initializes the browser-side object for us.

(For a simple subclass created via configuration in `app.js` which has its own instance name, the name of your constructor is the same as the name of your module, with the first letter capitalized. However, if you are subclassing a core Apostrophe module with the same name, prefix it with `My` to clearly distinguish it. If your module lives in `npm`, then the constructor's name should be prefixed with `Apos`. The `apostrophe-site` module makes sure these conventions work.)

Your constructor receives many of the same options that the server side manager object has access to, including `name`, `instance`, `css`, `typeCss`, `instanceLabel` and `pluralLabel`.

The `css` property is a CSS-friendly name for the instance type. The `typeCss` property is a CSS-friendly name for the index page type. These CSS-friendly names are very useful when manipulating DOM elements with jQuery.

A note to prospective authors of npm modules: *please do not use the Apos prefix or the `apostrophe-` prefix for your own modules*. Just to avoid confusion, we ask that third-party developers use their own prefix. You don't want your code to stop working when we release a module of the same name. We don't even use the prefix ourselves if we are writing project-specific code that won't be published in the npm repository.

"But if I use my own prefix, how will the server push the right call to construct my object?" Good question. You can fix that by adding one more property when you initialize your module on the server side as shown earlier:

```javascript
_.defaults(options, {
  instance: 'blogPost',
  name: options.name || 'blog',
  ...
  browser: {
    construct: 'XYZCoBlog'
  }
});
```

Now the server will push a call to create an `XYZCoBlog' object instead.

But we still haven't seen how to override methods on the browser side. So let's look at that code from `editor.js` in the blog module:

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
self.enableArea($el, 'parking', snippet.parking, function() {
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

### Other methods to consider overriding on the browser side

There are other methods you can override or extend. `addingToManager` is called before a snippet is added to the "manage blog posts" list view. The blog module overrides this method to add the publication date and tags of the snippet to fields that have been customized in each row of the `manage.html` template. (Note this method does not take a callback, as a reminder to keep it light and fast; loading something asynchronously for every row in the list view is just too slow.)

```javascript
  self.addingToManager = function($el, $snippet, snippet) {
    $snippet.find('[data-date]').text(snippet.publicationDate);
    if (snippet.tags !== null) {
      $snippet.find('[data-tags]').text(snippet.tags);
    }
  };
```

### Validating Snippets

All forms of validation supported by [apostrophe-schemas](https://github.com/punkave/apostrophe-schemas) are supported by snippets. However, that's currently not a terribly long list. And there will always be a few complex cases where custom validation code in the browser is nice to have.

You can write your own validator callback. Here's the default version:

```javascript
self.validate = function($el, data, action, callback) {
  return callback(null);
};
```

You can override this method to inspect anything in the DOM via `$el`, which contains all of the editable fields. And you can also inspect the properties of `data`, which has already been populated with the user's input by this point. In most cases the latter is the easiest way to go.

If you don't like what you find, make the user aware of the validation problem, then invoke the callback with an error. This error is not displayed to the user and simply prevents the save operation from completing for now.

If the validation problem concerns a particular field, you can use `aposSchemas` to call attention to the error:

```javascript
// I don't like what is in the title
aposSchemas.addError($el, 'title');
```

If all is well invoke the callback with `null`.

### Extending the Widget

A "widget" is used to display selected snippets in the context of a page. The standard widget for snippets is automatically subclassed when you subclass snippets, and it works well: you can pick your own pieces by title or pull them in by tag. But what if we want to add a new field to the widget editor, or change its behavior more significantly?

#### Extending the Widget on the Browser Side

Here's how to do it in the browser. Continuing with the "Stories" example above, we add this code to our constructor:

```javascript
var superExtendWidget = self.extendWidget;

// extendWidget is called after the widget is constructed but
// before it is populated; you can override methods of the
// "widget" object here

self.extendWidget = function(widget) {
  // Call the original extendWidget method first. Maybe you're
  // subclassing something that has an interesting one.
  superExtendWidget();

  var superAfterCreatingEl = widget.afterCreatingEl;
  var superBeforeUpdate = widget.beforeUpdate;

  // afterCreatingEl is called after the widget's DOM element
  // comes into being. Let's add code to populate a checkbox
  // called "special"

  widget.afterCreatingEl = function() {

    widget.$newType = widget.$el.find('[name="special"]');
    widget.$newType.prop('checked', widget.data.special);

    superAfterCreatingEl();

  };

  // When the widget is previewed or saved we want to
  // make sure we record the state of the checkbox in
  // widget.data. That's all we have to do to save it

  // Plumbing to use the same code for preview and save,
  // then call the right callback for each

  var superPrePreview = widget.prePreview;
  var superPreSave = widget.preSave;
  widget.prePreview = function(callback) {
    return beforeUpdate(superPrePreview, callback);
  };
  widget.preSave = function(callback) {
    return beforeUpdate(superPreSave, callback);
  };

  // Examine the checkbox and update the data object
  function beforeUpdate(callback, andThen) {
    widget.data.special = widget.$newType.is(':checked');
    return callback(andThen);
  }
};
```

#### Extending the Widget on the Server Side

And here's how we implement `special` on the server side. We'll demonstrate how to use it to change the query used to fetch objects for the widget:

```javascript
// In stories/index.js, inside the constructor, after the call to the base class constructor

var superExtendWidget = self.extendWidget;
self.extendWidget = function(widget) {
  superExtendWidget();
  var superAddCriteria = widget.addCriteria;
  widget.addCriteria = function(item, criteria, options) {
    superAddCriteria(item, criteria, options);
    // If we only want "special" objects, change the mongodb criteria
    if (item.special) {
     criteria.special = true;
    }
  };
  var superSanitize = widget.sanitize;
  widget.sanitize = function(item) {
    superSanitize(item);
    // Double negation ensures a nice clean boolean value
    item.special = !!item.special;
  };
};
```

Note that we use the "super pattern" to call the original version of each method we're overriding. Without this, other properties would not make it into our criteria or be sanitized for storage.

"How did `special` get saved on the server?" The default sanitizer for snippet widgets saves any properties it does not recognize without modifying them. It's possible to override `self.sanitizer` to be pickier in your `extendWidget` method.

"What other methods can I override?" Check out `widgets.js` in the `apostrophe-snippets` module for further inspiration.

## Advanced Server Side Topics

Let's return to the server side for a few advanced topics.

### Manipulating snippet objects in the database

The following methods are convenient for manipulating snippet objects:

`self.get(req, criteria, options, callback)`, as described earlier, retrieves snippets. `self.getOne` takes the same arguments but invokes its callback with just one result, or null, as the second argument.

`self.putOne(req, oldSlug, snippet, callback)` inserts or updates a single snippet. If you are not potentially changing the slug you can skip the `oldSlug` argument.

These methods respect the permissions of the current user and won't allow the user to do things they are not allowed to do. They should be used in preference to directly manipulating the `self._apos.pages` collection in most cases.

The `self.putOne` method also invokes `self.beforePutOne` method and `self.afterPutOne` methods, which always receive the parameters `req, oldSlug, options, snippet, callback`. This is a convenient point at which to update denormalized copies of properties or perform a sync to other systems. These methods differ from `beforeSave` in that they are used for all operations in which you want to update a snippet, not just when a user is editing one via the "Manage Snippets" dialog or importing them from CSV.

### Pushing our JavaScript and CSS assets to the browser

Great, but how do our `editor.js` and `content.js` files make it to the browser? And what about the various templates that are instantiated on the browser side to display modals like "New Blog Post" and "Manage Blog Posts?"

The answer is that the snippet module pushes them there for us:

```javascript
self.pushAsset('script', 'editor');
self.pushAsset('script', 'content');
self.pushAsset('template', 'new');
self.pushAsset('template', 'edit');
self.pushAsset('template', 'manage');
self.pushAsset('template', 'import');
```

As explained in the documentation of the main `apostrophe` module, the `pushAsset` call schedules scripts, stylesheets and templates to be "pushed" to the browser when building a complete webpage. Scripts and stylesheets are typically minified together in production, and templates that are pushed to the browser in this way are hidden at the end of the `body` element where they can be cloned when they are needed by the `apos.fromTemplate` method. And since we specified our own directory when setting up the `dirs` option, our versions of these files are found first.

So you don't need to worry about delivering any of the above files (`editor.js`, `editor.less`, `content.js`, `content.less`, `new.html`, `edit.html`, `manage.html`, and `import.html`). But if you wish to push additional browser-side assets as part of every page request, now you know how.

You can also push stylesheets by passing the `stylesheet` type as the first argument. Your stylesheets should be in `.less` files in the `public/css` subdirectory of your module. Be sure to take advantage of LESS; it's pretty brilliant. But plain old CSS is valid LESS too.

### Saving Extra Properties on the Server

*Remember, this is the hard way, just use `addFields` if you can.*

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

### Extending the `get` method to support custom criteria

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

### When the `manage` dialog and the public should see different things

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

### When Two Page Types Have the Same Instance Type

"Great, now I know how to subclass snippets in a big way. But all I want to do is present blog posts a little differently if my user picks the 'press releases' page type. What's the absolute minimum I have to do?"

Fair question. You can do it like this, in `app.js` where you configure modules:

```javascript
modules: {
  sweet: {
    extend: 'apostrophe-blog'
  },
  savory: {
    extend: 'apostrophe-blog'
  }
}
```

Add both page types as well:

```javascript
  pages: {
    types: [
      { name: 'default', label: 'Default (Two Column)' },
      { name: 'home', label: 'Home Page' },
      { name: 'sweet', label: 'Sweet-Styled Blog' },
      { name: 'savory', label: 'Savory-Styled Blog' },
    ]
  }, ... more configuration ...
```

Now create `index.html` and `show.html` files in `lib/modules/sweet/views` and `lib/modules/savory/views`.

Now you can create pages with either type. They will draw from the same pool of content (the "Articles" menu), but you can lock down the pages to display articles with particular tags.

### RSS Feed Options

The RSS feed feature can be configured via the `feed` option when configuring the module.

To shut off the feed entirely for snippets or any subclass of snippets, set `feed` to `false`.

The following RSS-related options are supported and can be passed to any module derived from snippets. Note that the title of the feed is normally set quite well already based on the title of your site (if you are using `apostrophe-site`) and the title of the index page.

```javascript
modules: {
  'apostrophe-blog': {
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
  }
}
```

### Supporting More Feed Types, Customizing the Feed

The following methods of the snippets module are involved. They are easy to subclass and extend to support more types of feeds:

`feedContentType`, `renderFeed`, `renderFeedItem`, `renderFeedItemDescription`

All of these receive the `req` object, so you can inspect `req.query.feed` to figure out what type of feed was asked for. THe standard templates that ship with the snippets module provide links to generate RSS feeds (`feed=rss`).

## Conclusion

Phew! That's a lot to chew on. But once you've digested it, you'll be able to create new content types in Apostrophe with very little work and as much code reuse as possible. That's a very cool thing.

We strongly recommend reading the documentation of the `apostrophe` and `apostrophe-pages` modules as well. There are no special privileges accorded to snippets in Apostrophe. Everything they offer is built on Apostrophe's modal templates, widgets, page storage capabilities and page loader functions.
