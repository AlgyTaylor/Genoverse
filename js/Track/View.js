/* FIXME:
  
  resetFeaturePositions

  context - canvas not attached to DOM
*/
Genoverse.Track.View = Base.extend({
  height         : 12,
  featureMargin  : { top: 3, right: 1, bottom: 1, left: 0 }, // left is never used
  fontHeight     : 10,
  fontFamily     : 'sans-serif',
  fontWeight     : 'normal',
  fontColor      : '#000000',
  color          : '#000000',
  minScaledWidth : 0.5,
  labels         : true,
  repeatLabel    : true,
  bump           : false,
  depth          : undefined,
  featureHeight  : undefined, // defaults to track height
  margin         : undefined,
  fixedHeight    : undefined,
  autoHeight     : undefined,
  resizable      : undefined,
  
  constructor: function (properties) {
    $.extend(this, properties);
    Genoverse.wrapFunctions(this);
    this.init();
  },
  
  // difference between init and constructor: init gets called on reset, if reset is implemented
  init: function () {
    this.setDefaults();
    this.scaleSettings = {};
  },
  
  setDefaults: function () {
    var margin = [ 'Top', 'Right', 'Bottom', 'Left' ];
    var protos = [ this.constructor.prototype, this.track.constructor.prototype ]; // Looks at values in the view, or the initial track config
    var i, j;
    
    var defaults = {
      featureHeight : function () { return this.constructor.prototype.height; }, // Base feature height must on default track height if not set
      margin        : function () { return this.browser.trackMargin; },
      fixedHeight   : function () { return this.featureHeight === this.height && !this.bump; },
      autoHeight    : function () { return !this.fixedHeight && this.height === this.constructor.prototype.height ? this.browser.autoHeight : false; },
      resizable     : function () { return !this.fixedHeight; }
    };
    
    for (i = 0; i < margin.length; i++) {
      if (typeof this['featureMargin' + margin[i]] === 'number') {
        this.featureMargin[margin[i].toLowerCase()] = this['featureMargin' + margin[i]];
      }
    }
    
    for (i in defaults) {
      this[i] = undefined;
      
      for (j = 0; j < protos.length; j++) {
        if (typeof protos[j][i] !== 'undefined') {
          this[i] = protos[j][i];
          break;
        }
      }
      
      if (typeof this[i] === 'undefined') {
        this[i] = defaults[i].call(this);
      }
    }
    
    this.context       = $('<canvas>')[0].getContext('2d'); // FIXME: DOM element in view
    this.height       += this.margin;
    this.initialHeight = this.height;
    this.font          = this.fontWeight + ' ' + this.fontHeight + 'px ' + this.fontFamily;
    this.labelUnits    = [ 'bp', 'kb', 'Mb', 'Gb', 'Tb' ];
    
    if (this.hidden) {
      this.height = 0;
    }
    
    if (this.autoHeight === 'force') {
      this.autoHeight  = true;
      this.fixedHeight = false;
      this.resizable   = false;
    }
    
    if (this.labels && this.labels !== 'overlay' && (this.depth || this.bump === 'labels')) {
      this.labels = 'separate';
    }
  },
  
  setScaleSettings: function (scale) { // FIXME: not really a setter, as it returns.
    var featurePositions, labelPositions;
    
    if (!this.scaleSettings[scale]) {
      featurePositions = featurePositions || new RTree();
      
      this.scaleSettings[scale] = {
        imgContainers    : $(), // FIXME: DOM element in view
        featurePositions : featurePositions,
        labelPositions   : this.labels === 'separate' ? labelPositions || new RTree() : featurePositions
      };
    }
    
    return this.scaleSettings[scale];
  },
  
  /*resetFeaturePositions: function () {
    this.scaleSettings    = {};
    this.featurePositions = new RTree();
    this.labelPositions   = this.labels === 'separate' ? new RTree() : this.featurePositions;
    
    for (var id in this.featuresById) {
      delete this.featuresById[id].position;
    }
  },*/
  
  scaleFeatures: function (features, scale) {
    var add = Math.max(scale, 1);
    var feature;
    
    for (var i = 0; i < features.length; i++) {
      feature = features[i];
      
      if (!feature.position) {
        feature.position = {};
      }
      
      if (!feature.position[scale]) {
        feature.position[scale] = {
          start  : feature.start * scale,
          width  : (feature.end - feature.start) * scale + add,
          height : feature.height || this.featureHeight
        };
        
        if (feature.position[scale].width < this.minScaledWidth) {
          feature.position[scale].width = this.minScaledWidth;
        }
      }
    }
    
    return features;
  },
  
  positionFeatures: function (features, params) {
    for (var i = 0; i < features.length; i++) {
      this.positionFeature(features[i], params);
    }
    
    params.width         = Math.ceil(params.width);
    params.height        = Math.ceil(params.height);
    params.featureHeight = Math.max(Math.ceil(params.featureHeight), this.fixedHeight ? Math.max(this.height, this.track.controller.minLabelHeight) : 0);
    params.labelHeight   = Math.ceil(params.labelHeight);
    
    return features;
  },
  
  positionFeature: function (feature, params) {
    var scale = params.scale;
    
    feature.position[scale].X = feature.position[scale].start - params.scaledStart; // FIXME: always have to reposition for X, in case a feature appears in 2 images. Pass scaledStart around instead?
    
    if (!feature.position[scale].positioned) {
      feature.position[scale].H = (feature.position[scale].height + this.featureMargin.top + this.featureMargin.bottom);
      feature.position[scale].W = feature.position[scale].width + (feature.marginRight || this.featureMargin.right);
      feature.position[scale].Y = (feature.y ? feature.y * (feature.position[scale].H + this.featureMargin.top + this.featureMargin.bottom) : this.featureMargin.top);
      
      if (feature.label) {
        if (typeof feature.label === 'string') {
          feature.label = feature.label.split('\n');
        }
        
        var context = this.context;
        
        feature.labelHeight = feature.labelHeight || (this.fontHeight + 2) * feature.label.length;
        feature.labelWidth  = feature.labelWidth  || Math.max.apply(Math, $.map(feature.label, function (l) { return Math.ceil(context.measureText(l).width); })) + 1;
        
        if (this.labels === true) {
          feature.position[scale].H += feature.labelHeight;
          feature.position[scale].W  = Math.max(feature.labelWidth, feature.position[scale].W);
        } else if (this.labels === 'separate' && !feature.position[scale].label) {
          feature.position[scale].label = {
            x: feature.position[scale].start,
            y: feature.position[scale].Y,
            w: feature.labelWidth,
            h: feature.labelHeight
          };
        }
      }
      
      var bounds = {
        x: feature.position[scale].start,
        y: feature.position[scale].Y,
        w: feature.position[scale].W,
        h: feature.position[scale].H
      };
      
      if (this.bump === true) {
        this.bumpFeature(bounds, feature, scale, this.scaleSettings[scale].featurePositions);
      }
      
      this.scaleSettings[scale].featurePositions.insert(bounds, feature);
      
      feature.position[scale].bottom = feature.position[scale].Y + feature.position[scale].H + this.margin;
      
      if (feature.position[scale].label) {
        var f = $.extend(true, {}, feature); // FIXME: hack to avoid changing feature.position[scale].Y in bumpFeature
        
        this.bumpFeature(feature.position[scale].label, f, scale, this.scaleSettings[scale].labelPositions);
        
        f.position[scale].label        = feature.position[scale].label;
        f.position[scale].label.bottom = f.position[scale].label.y + f.position[scale].label.h + this.margin;
        
        feature = f;
        
        this.scaleSettings[scale].labelPositions.insert(feature.position[scale].label, feature);
        
        params.labelHeight = Math.max(params.labelHeight, feature.position[scale].label.bottom);
      }
      
      feature.position[scale].positioned = true;
    }
    
    params.featureHeight = Math.max(params.featureHeight, feature.position[scale].bottom);
    params.height        = Math.max(params.height, params.featureHeight + params.labelHeight);
  },
  
  bumpFeature: function (bounds, feature, scale, tree) {
    var depth = 0;
    var bump;
    
    do {
      if (this.depth && ++depth >= this.depth) {
        if ($.grep(this.scaleSettings[scale].featurePositions.search(bounds), function (f) { return f.position[scale].visible !== false; }).length) {
          feature.position[scale].visible = false;
        }
        
        break;
      }
      
      bump = false;
      
      if ((tree.search(bounds)[0] || feature).id !== feature.id) {
        bounds.y += bounds.h;
        bump      = true;
      }
    } while (bump);
    
    feature.position[scale].Y = bounds.y;
  },
  
  draw: function (features, featureContext, labelContext, scale) {
    var feature;
    
    for (var i = 0; i < features.length; i++) {
      feature = features[i];
      
      if (feature.position[scale].visible !== false) {
        // TODO: extend with feature.position[scale], rationalize keys
        this.drawFeature($.extend({}, feature, {
          x             : feature.position[scale].X,
          y             : feature.position[scale].Y,
          width         : feature.position[scale].width,
          height        : feature.position[scale].height,
          labelPosition : feature.position[scale].label
        }), featureContext, labelContext, scale);
      }
    }
  },
  
  drawFeature: function (feature, featureContext, labelContext, scale) {
    if (feature.x < 0 || feature.x + feature.width > this.width) {
      this.truncateForDrawing(feature);
    }
    
    if (feature.color !== false) {
      if (!feature.color) {
        this.setFeatureColor(feature);
      }
      
      featureContext.fillStyle = feature.color;
      featureContext.fillRect(feature.x, feature.y, feature.width, feature.height);
    }
    
    if (this.labels && feature.label) {
      this.drawLabel(feature, labelContext, scale);
    }
    
    if (feature.borderColor) {
      featureContext.strokeStyle = feature.borderColor;
      featureContext.strokeRect(feature.x, feature.y + 0.5, feature.width, feature.height);
    }
    
    if (feature.decorations) {
      this.decorateFeature(feature, featureContext, scale);
    }
  },
  
  drawLabel: function (feature, labelContext, scale) {
    var labelStart = feature.x;
    
    if (feature.untruncated) {
      labelStart = this.repeatLabel && feature.untruncated.x < -this.width && feature.untruncated.x + feature.untruncated.width > feature.labelWidth ? 0 : feature.untruncated.x;
    }
    
    if (typeof feature.label === 'string') {
      feature.label = [ feature.label ];
    }
    
    if (labelStart > 0 || labelStart + feature.labelWidth < this.width) {
      if (!feature.labelColor) {
        this.setLabelColor(feature);
      }
      
      labelContext.fillStyle = feature.labelColor;
      
      if (this.labels === 'overlay') {
        var featureWidth = feature.untruncated ? feature.untruncated.width : feature.width;
        
        if (feature.labelWidth < featureWidth) {
          if (featureWidth < this.width) {
            labelContext.fillText(feature.label.join(' '), labelStart + featureWidth / 2, feature.y + (feature.height + 1) / 2);
          } else {
            labelContext.fillText(feature.label.join(' '), labelStart, feature.y + (feature.height + 1) / 2);
          }
        }
      } else {
        for (var i = 0; i < feature.label.length; i++) {
          labelContext.fillText(feature.label[i], labelStart, i * (this.fontHeight + 2) + (feature.labelPosition ? feature.labelPosition.y : feature.y + feature.height + this.featureMargin.bottom));
        }
      }
    }    
  },
  
  setFeatureColor: function (feature) {
    feature.color = this.color;
  },
  
  setLabelColor: function (feature) {
    feature.labelColor = feature.color || this.fontColor || this.color;
  },
  
  // truncate features - make the features start at 1px outside the canvas to ensure no lines are drawn at the borders incorrectly
  truncateForDrawing: function (feature) {
    var start = Math.min(Math.max(feature.x, -1), this.width + 1);
    var width = feature.x - start + feature.width;

    if (width + start > this.width) {
      width = this.width - start + 1;
    }
    
    feature.untruncated = { x: feature.x, width: feature.width };
    feature.x           = start;
    feature.width       = Math.max(width, 0);
  },
  
  formatLabel: function (label) {
    var str   = label.toString();
    var power = Math.floor((str.length - 1) / 3);
    var unit  = this.labelUnits[power];
    
    label /= Math.pow(10, power * 3);
    
    return Math.floor(label) + (unit === 'bp' ? '' : '.' + (label.toString().split('.')[1] || '').concat('00').substring(0, 2)) + ' ' + unit;
  },
  
  setHeight: function (height) {
    if (arguments[1] !== true && height < this.featureHeight) {
      height = 0;
    } else {
      height = this.hidden ? 0 : Math.max(height, this.track.controller.minLabelHeight);
    }
    
    this.height = height;
    
    return height;
  },
  
  drawBackground  : $.noop,
  decorateFeature : $.noop, // decoration for the features
  
 // systemEventHandlers : {}
});