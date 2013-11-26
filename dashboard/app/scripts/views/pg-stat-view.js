/*global define*/

define(['jquery', 'underscore', 'backbone', 'templates', 'helpers/gauge-helper', 'humanize', 'marionette'], function($, _, Backbone, JST, gaugeHelper, humanize) {
    'use strict';

    var PgStatView = Backbone.Marionette.ItemView.extend({
        className: 'col-md-3 custom-gutter',
        template: JST['app/scripts/templates/pg-stat.ejs'],
        initialize: function() {
            _.bindAll(this, 'fetchOSDPGCount', 'updateView');
            this.collection = new Backbone.Collection();
            this.App = Backbone.Marionette.getOption(this, 'App');
            if (this.App) {
                this.ReqRes = Backbone.Marionette.getOption(this.App, 'ReqRes');
                this.listenTo(this.App.vent, 'filter:update', this.fetchOSDPGCount);
            }
            this.listenTo(this, 'updateStats', this.updateView);
            gaugeHelper(this);
        },
        fetchOSDPGCount: function() {
            var self = this;
            setTimeout(function() {
                self.collection.set(self.ReqRes.request('get:osdpgcounts'));
                self.trigger('updateStats');
            }, 0);
        },
        trTemplate: _.template('<tr><td><%- state %></td><td><%- count %></td></tr>'),
        updateView: function() {
            var $tbody = this.$('tbody');
            var stats = this.collection.reduce(function(memo, model) {
                var states = model.get('pg_states');
                _.each(states, function(value, key) {
                    if (memo[key]) {
                        memo[key] += value;
                    } else {
                        memo[key] = value;
                    }
                });
                return memo;
            }, {});
            console.log(stats);
            var self = this;
            var html = _.reduce(stats, function(memo, count, state) {
                memo.push(self.trTemplate({
                    count: humanize.numberFormat(count, 0),
                    state: state
                }));
                return memo;
            }, []);
            $tbody.html(html.join(''));
        }
    });

    return PgStatView;
});