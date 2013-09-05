/*global define, Raphael*/

'use strict';
define(['jquery', 'underscore', 'backbone', 'helpers/raphael_support', 'templates', 'bootstrap', 'views/osd-detail-view', 'views/filter-view', 'models/application-model', 'helpers/animation', 'views/switcher-view', 'raphael', 'marionette'], function($, _, Backbone, Rs, JST, bs, OSDDetailView, FilterView, Models, animation, SwitcherView) {
    var OSDVisualization = Backbone.Marionette.ItemView.extend({
        template: JST['app/scripts/templates/viz.ejs'],
        serializeData: function() {
            return {};
        },
        originX: 0,
        originY: 0,
        step: 40,
        timer: null,
        pulseTimer: null,
        state: 'dashboard',
        ui: {
            'cardTitle': '.card-title',
            viz: '.viz',
            filter: '.filter',
            filterpanel: '.filter-panel',
            switcher: '.switcher',
            detail: '.detail-outer',
            spinner: '.icon-spinner'
        },
        events: {
            'click .viz': 'clickHandler',
            'click': 'screenSwitchHandler',
            'mouseenter circle, tspan': 'hoverHandler',
            'mouseleave circle, tspan': 'unhoverHandler'
        },
        collectionEvents: {
            'add': 'addOSD',
            'remove': 'removeOSD',
            'change': 'updateOSD',
            'request': 'spinnerOn',
            'sync error': 'spinnerOff',
            'reset': 'resetViews'
        },
        appEvents: {
            'keyup': 'keyHandler',
            'osd:update': 'updateCollection',
            'cluster:update': 'switchCluster',
            'viz:fullscreen': 'fullscreen',
            'viz:dashboard': 'dashboard',
            'viz:filter': 'filter',
            'viz:pulse': 'pulse'
        },
        spinnerOn: function() {
            this.ui.spinner.css('visibility', 'visible');
        },
        spinnerOff: function() {
            this.ui.spinner.css('visibility', 'hidden');
        },
        updateCollection: function() {
            if (this.App.Config['delta-osd-api'] && this.collection.length > 0) {
                this.collection.update.apply(this.collection);
            } else {
                var vent = this.App.vent;
                this.collection.fetch().then(function() {
                    // after collection update update the filter counts
                    vent.trigger('filter:update');
                });
            }
        },
        switchCluster: function(cluster) {
            if (cluster) {
                this.collection.cluster = cluster.get('id');
            }
        },
        setupAnimations: function(obj) {
            obj.vizMoveUpAnimation = animation.single('moveVizUpAnim');
            obj.vizMoveDownAnimation = animation.single('moveVizDownAnim');
            obj.vizSlideRightAnimation = animation.single('slideVizRightAnim');
            obj.vizSlideLeftAnimation = animation.single('slideVizLeftAnim');
            obj.fadeInAnimation = animation.single('fadeInAnim');
            obj.fadeOutAnimation = animation.single('fadeOutAnim');
        },
        getHosts: function() {
            return _.uniq(this.collection.pluck('host'));
        },
        getOSDCounters: function() {
            /* TODO write a single pass version of this */
            return {
                down: this.collection.where({
                    'up': 0,
                    'in': 0
                }).length,
                inup: this.collection.where({
                    'up': 1,
                    'in': 1
                }).length,
                outup: this.collection.where({
                    'up': 1,
                    'in': 0
                }).length,
                indown: this.collection.where({
                    'up': 0,
                    'in': 1
                }).length

            };
        },
        getPGCounters: function() {
            /*jshint camelcase: false */
            return this.collection.pg_state_counts || {};
        },
        initialize: function() {
            this.App = Backbone.Marionette.getOption(this, 'App');
            this.width = 17 * this.step;
            this.height = 11 * this.step;
            this.w = 720;
            this.h = 520;
            _.bindAll(this);

            this.setupAnimations(this);

            this.keyHandler = _.debounce(this.keyHandler, 250, true);
            this.screenSwitchHandler = _.debounce(this.screenSwitchHandler, 250, true);

            // App Level Events
            Backbone.Marionette.bindEntityEvents(this, this.App.vent, Backbone.Marionette.getOption(this, 'appEvents'));

            // App Level Request Responses
            var self = this;
            this.App.ReqRes.setHandler('get:hosts', function() {
                return self.getHosts();
            });
            this.App.ReqRes.setHandler('get:osdcounts', function() {
                return self.getOSDCounters();
            });
            this.App.ReqRes.setHandler('get:pgcounts', function() {
                return self.getPGCounters();
            });
        },
        screenSwitchHandler: function() {
            if (this.state === 'dashboard') {
                this.App.vent.trigger('app:fullscreen');
            }
        },
        fullscreen: function(callback) {
            this.state = 'fullscreen';
            this.ui.cardTitle.text('OSD Workbench');
            this.$el.removeClass('card').addClass('workbench');
            var self = this;
            return this.vizMoveUpAnimation(this.$el, callback).then(function() {
                return self.vizSlideRightAnimation(self.ui.viz);
            }).then(function() {
                self.ui.viz.addClass('viz-fullscreen');
                self.ui.filterpanel.show();
                self.App.vent.trigger('filter:update');
                return self.fadeInAnimation(self.ui.filterpanel);
            });
        },
        dashboard: function(callback) {
            this.state = 'dashboard';
            this.ui.cardTitle.text('OSD Status');
            this.$el.addClass('card').removeClass('workbench');
            var self = this;
            return this.vizMoveDownAnimation(this.$el, callback).then(function() {
                self.fadeOutAnimation(self.ui.filterpanel).then(function() {
                    self.ui.filterpanel.css('visibility', 'hidden');
                }).then(function() {
                    self.ui.filterpanel.css('visibility', 'visible');
                });
                self.reset();
                return self.vizSlideLeftAnimation(self.ui.viz);
            }).then(function() {
                self.ui.viz.removeClass('viz-fullscreen');
                self.ui.filterpanel.hide();
            });
        },
        resetViews: function(collection, options) {
            _.each(options.previousModels, this.cleanupModelView);
        },
        addOSD: function(m) {
            this.moveCircle(m, this.collection.indexOf(m));
        },
        cleanupModelView: function(m) {
            var views = m.views;
            if (views) {
                var circle = views.circle;
                circle.animate({
                    'opacity': 0,
                    'r': 0
                }, 250, 'easeIn', function() {
                    circle.remove();
                });
                m.views.text.remove();
                if (views.pcircle) {
                    views.pcircle.stop().remove();
                }
                m.views = null;
            }
        },
        removeOSD: function(m) {
            this.collection.remove(m);
            this.cleanupModelView(m);
        },
        updateOSD: function(m) {
            m.set(m.attributes);
        },
        drawGrid: function(d) {
            var path = Rs.calcGrid(this.originX, this.originY, this.width, this.height, this.step);
            var path1 = this.r.path('M0,0').attr({
                'stroke-width': 1,
                'stroke': '#5e6a71',
                'opacity': 0.40
            });
            this.drawLegend(this.r, 285, 475);
            var anim = Raphael.animation({
                path: path,
                callback: d.resolve
            }, 250);
            path1.animate(anim);
        },
        startPosition: [{
            x: 40,
            y: 40
        }, {
            x: 600,
            y: 40
        }, {
            x: 600,
            y: 400
        }, {
            x: 40,
            y: 400
        }],
        moveCircle: function(model, index) {
            var start = this.startPosition[Math.floor(Math.random() * 4)];
            var pos = Rs.calcPosition(index, this.originX, this.originY, this.width, this.height, this.step);
            this.animateCircleTraversal(this.r, start.x, start.y, 8, pos.nx, pos.ny, model);
        },
        calculatePositions: function(filterFn) {
            var coll = this.collection.models;
            if (filterFn) {
                coll = _.filter(coll, filterFn);
            }
            //console.log(coll.length);
            var d = $.Deferred();
            var last = _.last(coll);
            if (last) {
                last.deferred = d;
            } else {
                d.resolve();
            }
            _.each(coll, this.moveCircle);
            return d.promise();
        },
        legendCircle: function(r, originX, originY, index) {
            // Helper method to draw circles for use as legends beneath viz.
            var srctext = ['down', 'up/out', 'down/in', 'up/in'];
            var srcstate = [{
                up: 0,
                'in': 0
            }, {
                up: 1,
                'in': 0
            }, {
                up: 0,
                'in': 1
            }, {
                up: 1,
                'in': 1
            }];
            var percent = [1, 0.66, 0.66, 0.4];

            var m = new Models.OSDModel(_.extend(srcstate[index], {
                capacity: 1024,
                used: percent[index] * 1024
            }));
            var c = r.circle(originX, originY, 16 * m.getPercentage()).attr({
                fill: m.getColor(),
                stroke: 'none',
                'cursor': 'default',
                opacity: 0
            });
            var aFn = Raphael.animation({
                opacity: 1
            }, 250, 'easeOut');
            var text = srctext[index];
            r.text(originX, originY + 23, text).attr({
                'cursor': 'default',
                'font-size': '12px',
                'font-family': 'ApexSansLight'
            });
            return c.animate(aFn);
        },
        drawLegend: function(r, originX, originY) {
            // Calls legend circle to place in viz.
            var xp = originX,
                i;
            for (i = 0; i < 4; i += 1, xp += 50) {
                this.legendCircle(r, xp, originY, i);
            }
        },
        animateCircleTraversal: function(r, originX, originY, radius, destX, destY, model) {
            var c = r.circle(originX, originY, 20 * model.getPercentage()).attr({
                fill: model.getColor(),
                stroke: 'none'
            });
            c.data('modelid', model.id);
            var t;
            var aFn = Raphael.animation({
                cx: destX,
                cy: originY
            }, 250, 'easeOut', function() {
                c.animate({
                    cx: destX,
                    cy: destY
                }, 333, 'easeIn', function() {
                    t = r.text(destX, destY - 1, model.id).attr({
                        font: '',
                        stroke: '',
                        fill: '',
                        style: ''
                    });
                    t.data('modelid', model.id);
                    if (model.deferred) {
                        model.deferred.resolve();
                        model.deferred = null;
                    }
                    model.views = {
                        circle: c,
                        text: t
                    };
                });
            });
            return c.animate(aFn);
        },
        simulateUsedChanges: function() {
            this.removePulse();
            var maxRed = 2;
            this.collection.each(function(m) {
                var up = true;
                var _in = Math.random();
                _in = _in < 0.95;
                if (!_in && (Math.random() > 0.6) && maxRed > 0) {
                    maxRed -= 1;
                    up = false;
                    //console.log(m.id + ' setting to down');
                } else {
                    if (Math.random() > 0.6) {
                        up = false;
                    }
                }
                m.set({
                    'up': up ? 1 : 0,
                    'in': _in ? 1 : 0
                });
            });
            this.App.vent.trigger('updateTotals');
            this.App.vent.trigger('status:healthwarn');
        },
        resetChanges: function() {
            this.removePulse();
            this.collection.each(function(m) {
                m.set({
                    'up': 1,
                    'in': 1
                });
            });
            this.App.vent.trigger('updateTotals');
            this.App.vent.trigger('status:healthok');
        },
        startSimulation: function() {
            var self = this;
            this.timer = setTimeout(function() {
                self.simulateUsedChanges();
                self.timer = self.startSimulation();
            }, 3000);
            return this.timer;
        },
        stopSimulation: function() {
            clearTimeout(this.timer);
            this.timer = null;
        },
        render: function() {
            Backbone.Marionette.ItemView.prototype.render.apply(this);
            this.r = window.Raphael(this.ui.viz[0], this.w, this.h);
            this.$detailPanel = new OSDDetailView({
                App: this.App,
                el: this.ui.detail
            });
            this.$filter = new FilterView({
                App: this.App,
                el: this.ui.filter
            }).render();
            this.$switcher = new SwitcherView({
                App: this.App,
                el: this.ui.switcher
            }).render();
            var d = $.Deferred();
            this.drawGrid(d);
            var p = d.promise();
            var vent = this.App.vent;
            p.then(this.calculatePositions).then(function() {
                vent.trigger('viz:render');
            });
            return p;
        },
        keyHandler: function(evt) {
            evt.preventDefault();
            if (!evt.keyCode) {
                return;
            }
            var keyCode = evt.keyCode;
            if (keyCode === 27) /* Escape */
            {
                this.App.vent.trigger('escapekey');
            }
            if (keyCode === 82) /* r */
            {
                this.resetChanges();
                return;
            }
            if (keyCode === 85) /* u */
            {
                this.simulateUsedChanges();
                return;
            }
            if (keyCode === 32) /* space */
            {
                var $spinner = $('.icon-spinner');
                if (this.timer === null) {
                    this.startSimulation();
                    $spinner.closest('i').addClass('.icon-spin').show();
                } else {
                    this.stopSimulation();
                    $spinner.closest('i').removeClass('.icon-spin').hide();
                }
            }
        },
        removePulse: function() {
            if (this.circle) {
                this.circle.stop().remove();
                this.circle = null;
                this.pulseTimer = null;
            }
        },
        pulseAnimation: Raphael.animation({
            r: 30,
            'stroke-opacity': 0,
        }, 1000, 'linear'),
        addPulse: function(attrs, id) {
            var circle = this.r.circle(attrs.cx, attrs.cy, attrs.r + 1).attr({
                'stroke': '#000'
            }).data('modelid', id).animate(this.pulseAnimation.repeat('Infinity'));
            return circle;
        },
        unhoverHandler: function() {
            if (this.pulseTimer === null) {
                // install a remove hover timer if none exists
                this.pulseTimer = setTimeout(this.removePulse, 1500);
            }
        },
        hoverHandler: function(evt) {
            if (this.state === 'dashboard') {
                return;
            }
            if (evt.target.nodeName === 'tspan' || evt.target.nodeName === 'circle') {
                evt.stopPropagation();
                evt.preventDefault();
                var x = evt.clientX;
                var y = evt.clientY;
                var el = this.r.getElementByPoint(x, y);
                if (el) {
                    var id = el.data('modelid');
                    if (this.pulseTimer) {
                        // cancel the remove hover timer if we're
                        // still active
                        clearTimeout(this.pulseTimer);
                        this.pulseTimer = null;
                    }
                    if (this.circle && this.circle.data('modelid') === id) {
                        // ignore hover event if you are hovered over the
                        // pulsing circle.
                        return;
                    }
                    //console.log(id);
                    if (_.isNumber(id)) {
                        // ignore circles and tspans without data
                        var views = this.collection.get(id).views;
                        if (views) {
                            // use the underlying circle element for initial dimensions
                            var circle = views.circle;
                            if (circle) {
                                this.removePulse();
                                this.circle = this.addPulse(circle.attrs, id);
                            }
                        }
                    }
                    return;
                }
            }
        },
        clickHandler: function(evt) {
            if (this.state === 'dashboard') {
                return;
            }
            evt.stopPropagation();
            evt.preventDefault();
            if (evt.target.nodeName === 'tspan' || evt.target.nodeName === 'circle') {
                var x = evt.clientX;
                var y = evt.clientY;
                //console.log(x + ' / ' + y);
                var el = this.r.getElementByPoint(x, y);
                //console.log(el);
                //console.log(el.attrs.x + ' / ' + el.attrs.y);
                if (el) {
                    var id = el.data('modelid');
                    //console.log(id);
                    if (_.isNumber(id)) {
                        // ignore circles and tspans without data
                        var attr = _.clone(this.collection.get(id).attributes);
                        attr.clazz = 'detail-outer-bottom-right';
                        if (el.attrs.x || el.attrs.cx) {
                            var xthres = this.w / 2,
                                ythres = this.h / 2;
                            var ix = el.attrs.x || el.attrs.cx,
                                iy = el.attrs.y || el.attrs.cy;
                            if (ix > xthres && iy > ythres) {
                                attr.clazz = 'detail-outer-top-left';
                            } else if (ix < xthres && iy > ythres) {
                                attr.clazz = 'detail-outer-top-right';
                            } else if (ix > xthres && iy < ythres) {
                                attr.clazz = 'detail-outer-bottom-left';
                            }
                        }
                        this.$detailPanel.set(attr);
                    }
                    return;
                }
            }
        },
        filter: function(filterCol) {
            var enabled = filterCol.where({
                enabled: true,
                visible: true
            });
            this.resetViews(null, {
                previousModels: this.collection.models
            });
            var vent = this.App.vent;
            return this.calculatePositions(function(m) {
                return _.find(enabled, function(obj) {
                    if (_.isFunction(obj.get('match'))) {
                        var t = obj.get('match')(m);
                        //console.log('matched ' + m.id + ' ' + t);
                        return t;
                    }
                    return false;
                });
            }).then(function() {
                vent.trigger('viz:render');
            });
        },
        pulse: function(filterCol) {
            var pulsed = filterCol.where({
                pulse: true,
                visible: true
            });
            var self = this;
            this.collection.filter(function(value) {
                var views = value.views;
                if (views && views.pcircle) {
                    views.pcircle.stop().remove();
                    views.pcircle = null;
                }
                return _.find(pulsed, function(obj) {
                    if (_.isFunction(obj.get('match'))) {
                        var t = obj.get('match')(value);
                        if (t) {
                            if (value.views && value.views.circle) {
                                var attrs = value.views.circle.attrs;
                                views.pcircle = self.r.circle(attrs.cx, attrs.cy, attrs.r + 1).attr({
                                    'stroke': '#000'
                                }).animate(self.pulseAnimation.repeat('Infinity'));
                            }
                        }
                        return t;
                    }
                    return false;
                });
            });
        },
        reset: function() {
            this.resetViews(null, {
                previousModels: this.collection.models
            });
            var vent = this.App.vent;
            return this.calculatePositions().then(function() {
                vent.trigger('viz:render');
            });
        }
    });
    return OSDVisualization;
});
