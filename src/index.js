'use strict';
var d3 = require('d3');
var utils = require('lightning-client-utils');
var MultiaxisZoom = require('d3-multiaxis-zoom');
var _ = require('lodash');
var LightningVisualization = require('lightning-visualization');
var fs = require('fs');
var css = fs.readFileSync(__dirname + '/style.css');

var Visualization = LightningVisualization.extend({

    getDefaultStyles: function() {
        return {
            color: '#deebfa',
            stroke: '#68a1e5',
            size: 8,
            alpha: 0.9
        }
    },

    getDefaultOptions: function() {
        return {
            brush: true,
            tooltips: true,
            zoom: true
        }
    },

    init: function() {
        MultiaxisZoom(d3);
        this.margin = {top: 0, right: 0, bottom: 20, left: 60};
        if(_.has(this.data, 'xaxis')) {
            this.margin.bottom = 57;
        }
        if(_.has(this.data, 'yaxis')) {
            this.margin.left = 85;
        }
        this.render();
    },

    css: css,

    render: function() {

        var data = this.data;
        var height = this.height;
        var width = this.width;
        var options = this.options;
        var selector = this.selector;
        var margin = this.margin;
        var self = this;

    
        var points = data.points;

        var xDomain = d3.extent(points, function(d) {
                return d.x;
            });
        var yDomain = d3.extent(points, function(d) {
                return d.y;
            });

        var xRange = xDomain[1] - xDomain[0];
        var yRange = yDomain[1] - yDomain[0];

        this.x = d3.scale.linear()
            .domain([xDomain[0] - xRange * 0.1, xDomain[1] + xRange * 0.1])
            .range([0, width - margin.left - margin.right]);

        this.y = d3.scale.linear()
            .domain([yDomain[0] - yRange * 0.1, yDomain[1] + yRange * 0.1])
            .range([height - margin.top - margin.bottom, 0]);

        this.zoom = d3.behavior.zoom()
            .x(this.x)
            .y(this.y)
            .on('zoom', zoomed);

        var highlighted = [];
        var selected = [];

        var container = d3.select(selector)
            .append('div')
            .style('width', width + 'px')
            .style('position', 'relative')
            .style('overflow', 'hidden')
            .style('height', height + 'px');

        var canvas = container
            .append('canvas')
            .attr('class', 'scatter-plot canvas')
            .attr('width', width - margin.left - margin.right)
            .attr('height', height - margin.top - margin.bottom)
            .style('margin-left', margin.left + 'px')
            .style('margin-right', margin.right + 'px')
            .style('margin-top', margin.top + 'px')
            .style('margin-bottom', margin.bottom + 'px')
            .call(this.zoom)
            .on('dblclick.zoom', null);

        var ctx = canvas
            .node()
            .getContext('2d');

        var svg = container
            .append('svg:svg')
            .attr('class', 'scatter-plot svg')
            .attr('width', width)
            .attr('height', height)
            .append('svg:g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
            .call(this.zoom);

        if (!self.options.zoom) {
            svg.on("wheel.zoom", null);
            svg.on("mousewheel.zoom", null);
            canvas.on("wheel.zoom", null);
            canvas.on("mousewheel.zoom", null);
        }

        svg.append('rect')
            .attr('width', width - margin.left - margin.right)
            .attr('height', height - margin.top - margin.bottom)
            .attr('class', 'scatter-plot rect');

        // setup brushing
        if (options.brush) {

            var shiftKey;

            var brush = d3.svg.brush()
                .x(this.x)
                .y(this.y)
                .on('brushstart', function() {
                    // remove any highlighting
                    highlighted = [];
                    if (options.tooltips) {
                        self.removeTooltip();
                    }
                    // select a point if we click without extent
                    var pos = d3.mouse(this);
                    var found = utils.nearestPoint(self.data.points, pos, self.x, self.y);
                    if (found) {
                        if (_.indexOf(selected, found.i) == -1) {
                            selected.push(found.i);
                        } else {
                            _.remove(selected, function(d) { return d == found.i; });
                        }
                        redraw();
                    }
                })
                .on('brush', function() {
                    // select points within extent
                    var extent = d3.event.target.extent();
                    if (Math.abs(extent[0][0] - extent[1][0]) > 0 & Math.abs(extent[0][1] - extent[1][1]) > 0) {
                        selected = [];
                        _.forEach(points, function(p) {
                            if (_.indexOf(selected, p.i) == -1) {
                                var cond1 = (p.x > extent[0][0] & p.x < extent[1][0]);
                                var cond2 = (p.y > extent[0][1] & p.y < extent[1][1]);
                                if (cond1 && cond2) {
                                    selected.push(p.i);
                                }
                            }
                        });
                    }
                    redraw();
                })
                .on('brushend', function() {
                    getUserData();
                    d3.event.target.clear();
                    d3.select(this).call(d3.event.target);
                });

            container
                .append('svg:svg')
                .attr('class', 'scatter-plot brush-container')
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom)
                .append('g')
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
                .attr('class', 'brush')
                .call(brush);

            d3.selectAll('.brush .background')
                .style('cursor', 'default');

            d3.selectAll('.brush')
                .style('pointer-events', 'none');

            d3.select(selector).on('keydown', function() {
                shiftKey = d3.event.shiftKey;
                if (shiftKey) {
                    d3.selectAll('.brush').style('pointer-events', 'all');
                    d3.selectAll('.brush .background').style('cursor', 'crosshair');
                }
            });

            d3.select(selector).on('keyup', function() {
                if (shiftKey) {
                    d3.selectAll('.brush').style('pointer-events', 'none');
                    d3.selectAll('.brush .background').style('cursor', 'default');
                }
                shiftKey = false;
            });

        }

        // setup tooltips
        if (options.tooltips) {
            var mouseHandler = function() {
                if (d3.event.defaultPrevented) return;
                var pos = d3.mouse(this);
                var found = utils.nearestPoint(points, pos, self.x, self.y);
                if (found) {
                    highlighted = [];
                    highlighted.push(found.i);
                    self.emit('hover', found);
                } else {
                    highlighted = [];
                    self.removeTooltip();
                }
                selected = [];
                redraw();
            }
            canvas.on('click', mouseHandler);
        }

        var makeXAxis = function () {
            return d3.svg.axis()
                .scale(self.x)
                .orient('bottom')
                .ticks(5);
        };

        var makeYAxis = function () {
            return d3.svg.axis()
                .scale(self.y)
                .orient('left')
                .ticks(5);
        };

        function customTickFormat(d) {
            return parseFloat(d3.format('.3f')(d));
        }

        this.xAxis = d3.svg.axis()
            .scale(self.x)
            .orient('bottom')
            .ticks(5)
            .tickFormat(customTickFormat);

        svg.append('g')
            .attr('class', 'x axis')
            .attr('transform', 'translate(0, ' + (height - margin.top - margin.bottom) + ')')
            .call(self.xAxis);

        this.yAxis = d3.svg.axis()
            .scale(self.y)
            .orient('left')
            .ticks(5)
            .tickFormat(customTickFormat);

        svg.append('g')
            .attr('class', 'y axis')
            .call(self.yAxis);

        svg.append('g')
            .attr('class', 'x grid')
            .attr('transform', 'translate(0,' + (height - margin.top - margin.bottom) + ')')
            .call(makeXAxis()
                    .tickSize(-(height - margin.top - margin.bottom), 0, 0)
                    .tickFormat(''));

        svg.append('g')
            .attr('class', 'y grid')
            .call(makeYAxis()
                    .tickSize(-(width - margin.left - margin.right), 0, 0)
                    .tickFormat(''));

        // automatically set line width based on number of points
        var strokeWidth = points.length > 500 ? 1 : 1.1;

        function redraw() {
            ctx.clearRect(0, 0, width + margin.left + margin.right, height + margin.top + margin.bottom);
            draw()
        }

        function draw() {

            var cx, cy;

            _.forEach(self.data.points, function(p) {
                var alpha, fill;
                if (selected.length > 0) {
                    if (_.indexOf(selected, p.i) >= 0) {
                        alpha = 0.9
                    } else {
                        alpha = 0.1
                    }
                } else {
                    alpha = p.a
                }
                if (options.tooltips && _.indexOf(highlighted, p.i) >= 0) {
                    fill = d3.rgb(d3.hsl(p.c).darker(0.75))
                } else {
                    fill = p.c
                }
                cx = self.x(p.x);
                cy = self.y(p.y);
                ctx.beginPath();
                ctx.arc(cx, cy, p.s, 0, 2 * Math.PI, false);
                ctx.fillStyle = utils.buildRGBA(fill, alpha);
                ctx.strokeWidth = strokeWidth;
                ctx.strokeStyle = utils.buildRGBA(p.k, alpha);
                ctx.fill();
                ctx.stroke();
            });

            if(options.tooltips && highlighted.length) {
                self.showTooltip(self.data.points[highlighted[0]]);
            }
        }

        function updateAxis() {

            svg.select('.x.axis').call(self.xAxis);
            svg.select('.y.axis').call(self.yAxis);
            svg.select('.x.grid')
                .call(makeXAxis()
                    .tickSize(-(height - margin.top - margin.bottom), 0, 0)
                    .tickFormat(''));
            svg.select('.y.grid')
                .call(makeYAxis()
                    .tickSize(-(width - margin.left - margin.right), 0, 0)
                    .tickFormat(''));

        }

        function zoomed() {
            ctx.clearRect(0, 0, width - margin.left - margin.right, height - margin.top - margin.bottom);
            updateAxis();
            draw();
        }

        var txt;
        if(_.has(this.data, 'xaxis')) {
            txt = this.data.xaxis;
            if(_.isArray(txt)) {
                txt = txt[0];
            }
            svg.append('text')
                .attr('class', 'x label')
                .attr('text-anchor', 'middle')
                .attr('x', (width - margin.left - margin.right) / 2)
                .attr('y', height - margin.top - 5)
                .text(txt);
        }
        if(_.has(this.data, 'yaxis')) {
            txt = this.data.yaxis;
            if(_.isArray(txt)) {
                txt = txt[0];
            }

            svg.append('text')
                .attr('class', 'y label')
                .attr('text-anchor', 'middle')
                .attr('transform', 'rotate(-90)')
                .attr('x', - (height - margin.top - margin.bottom) / 2)
                .attr('y', -margin.left + 20)
                .text(txt);
        }

        if(_.has(this.data, 'verticalline')) {
            xval = this.data.verticalline;

            svg.append("line")
                .attr("x1", self.x(xval))  //<<== change your code here
                .attr("y1", 0)
                .attr("x2", self.x(xval))  //<<== and here
                .attr("y2", height - margin.top - margin.bottom)
                .style("stroke-width", 2)
                .style("stroke", "red")
                .style("fill", "none");

        }

        d3.select(selector).attr('tabindex', -1);

        function getUserData() {

            utils.sendCommMessage(self, 'selection', selected);
            var x = _.map(selected, function(d) {return points[d].x});
            var y = _.map(selected, function(d) {return points[d].y});
            utils.updateSettings(self, {
                selected: selected,
                x: x,
                y: y
            }, function(err) {
                if(err) {
                    console.log('err saving user data');
                }
            });
        }

        draw();
        
        this.redraw = redraw;

    },

    formatData: function(data) {

        var retColor = utils.getColorFromData(data);
        var retSize = data.size || [];
        var retAlpha = data.alpha || [];
        var styles = this.styles;

        var c, s, a;

        data.points = data.points.map(function(d, i) {
            d.x = d[0];
            d.y = d[1];
            d.i = i;
            c = retColor.length > 1 ? retColor[i] : retColor[0];
            s = retSize.length > 1 ? retSize[i] : retSize[0];
            a = retAlpha.length > 1 ? retAlpha[i] : retAlpha[0];
            d.c = c ? c : styles.color;
            d.s = s ? s : styles.size;
            d.k = c ? c.darker(0.75) : styles.stroke;
            d.a = a ? a : styles.alpha;
            d.l = (data.labels || []).length > i ? data.labels[i] : null;
            return d;
        });

        return data

    },

    updateData: function(formattedData) {
        this.data = formattedData;
        this.redraw();
    },

    appendData: function(formattedData) {        
        this.data.points = this.data.points.concat(formattedData.points);
        this.redraw();
    },

    getLabelForDataPoint: function(d) {
        if(!_.isNull(d.l) && !_.isUndefined(d.l)) {
            return d.l;
        }
        return ('x: ' + d3.round(d.x, 2) + '<br>' + 'y: ' + d3.round(d.y, 2));
    },

    buildTooltip: function(d) {

        var label = this.getLabelForDataPoint(d);
        this.removeTooltip();

        var cx = this.x(d.x);
        var cy = this.y(d.y);
        if(cx < 0 || cx > (this.width - this.margin.left - this.margin.right)) {
            return;
        }
        if(cy < 0 || cy > (this.height - this.margin.top - this.margin.bottom)) {
            return;
        }

        this.tooltipEl = document.createElement('div');
        this.tooltipEl.innerHTML = label;

        var styles = {
            left: (this.x(d.x) + this.margin.left - 50) + 'px',
            bottom: (this.height - this.y(d.y) + d.s + 5) + 'px',
            position: 'absolute',
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            textAlign: 'center',
            color: 'white',
            paddingTop: '5px',
            paddingBottom: '5px',
            fontSize: '12px',
            borderRadius: '4px',
            width: '100px',
            zIndex: '999'
        }
        _.extend(this.tooltipEl.style, styles)


    },

    renderTooltip: function() {
        var container
        if (typeof this.selector === 'string') container = this.qwery(this.selector + ' div')[0];
        else container = this.selector.children[0];
        if(this.tooltipEl && container) {
            container.appendChild(this.tooltipEl);
        }
    },

    showTooltip: function(d) {
        this.buildTooltip(d);
        this.renderTooltip();
    },

    removeTooltip: function() {
        if(this.tooltipEl) {
            this.tooltipEl.remove();
            this.tooltipEl = null;
        }
    }

});


module.exports = Visualization;
