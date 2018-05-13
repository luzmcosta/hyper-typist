'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var _require = require('child_process'),
    exec = _require.exec;

var fs = require('fs');
var path = require('path');

var CHAR_CODE_1 = 161;
var CHAR_CODE_2 = 8482;
var CHAR_CODE_3 = 163;

var QUICK_SELECT_CHAR_CODE = [CHAR_CODE_1, CHAR_CODE_2, CHAR_CODE_3];

var reactHistoryNav = void 0;

var allTerminals = {};
var currTerminal = void 0;

var currPid = '';
var currUserInputData = '';
var currCwd = '~';
var historyEntries = [];

var suppressMode = false;

exports.decorateConfig = function (config) {
  return Object.assign({}, config, {
    css: '\n      ' + (config.css || '') + '\n      .hyper-typist {\n        position: fixed;\n        right: 0;\n        top: 0;\n        bottom: 0;\n        width: 45ch;\n        min-width: 1ch;\n        max-width: 60ch;\n        overflow: scroll;\n        pointer-events: none;\n      }\n      .hyper-typist_list {\n        pointer-events: initial;\n      }\n      .hyper-typist_list-item {\n        cursor: pointer;\n        line-height: 2.5ch;\n      }\n      .hyper-typist_list-item:after {\n        content: "";\n        display: block;\n        top: 0px;\n        left: 0px;\n        width: 100%;\n        height: 100%;\n        position: absolute;\n        background-color: currentColor;\n        opacity: 0;\n        transition: opacity .1s ease;\n      }\n      .hyper-typist_list-item:hover {\n        padding: 3px;\n        border: 1px solid currentColor;\n      }\n      .hyper-typist_list-item:hover.hyper-typist_list-item:after {\n        opacity: 0.4;\n      }\n      .hyper-typist_list-item:active.hyper-typist_list-item:after {\n        opacity: 1;\n      }\n      .hyper-typist_entry-index {\n        margin-right: 1ch;\n        opacity: .5;\n      }\n    '
  });
};

// @TODO Move presentation to its own file.
var presentation = {};

presentation.entry = function (entry) {
  // Define React, as it's used implicitly below.
  // eslint-disable-next-line no-unused-vars
  var React = presentation.view;

  return React.createElement(
    'div',
    { 'class': 'hyper-typist_list-item' },
    React.createElement(
      'span',
      { 'class': 'hyper-typist_entry-index' },
      entry.index
    ),
    React.createElement(
      'span',
      { 'class': 'hyper-typist_entry-command' },
      entry.command
    )
  );
};

presentation.list = function (historyEntries) {
  var _presentation$view;

  return (_presentation$view = presentation.view).createElement.apply(_presentation$view, ['div', { className: 'hyper-typist_list' }].concat(_toConsumableArray(historyEntries.map(presentation.entry))));
};

presentation.main = function (historyEntries) {
  return presentation.view.createElement('div', { className: 'hyper-typist' }, presentation.list(historyEntries));
};

exports.decorateHyper = function (Hyper, _ref) {
  var React = _ref.React;

  return function (_React$Component) {
    _inherits(_class, _React$Component);

    /**
     * Bind to events.
     *
     * @param {Object} props
     */
    function _class(props) {
      _classCallCheck(this, _class);

      var _this = _possibleConstructorReturn(this, (_class.__proto__ || Object.getPrototypeOf(_class)).call(this, props));

      reactHistoryNav = _this;
      _this.state = {};
      _this.handleClick = _this.handleClick.bind(_this);
      return _this;
    }

    /**
     * Execute on click event.
     *
     * @param {Object} e
     */


    _createClass(_class, [{
      key: 'handleClick',
      value: function handleClick(e) {}

      /**
       * Render results panel.
       *
       * @return {React}
       */

    }, {
      key: 'render',
      value: function render() {
        // Set presentation's renderer.
        presentation.view = React;

        var customChildren = this.props.customChildren;

        var existingChildren = customChildren ? customChildren instanceof Array ? customChildren : [customChildren] : [];

        return React.createElement(Hyper, Object.assign({}, this.props, {
          // Render to .hyper_main via customInnerChildren.
          customInnerChildren: existingChildren.concat(presentation.main(historyEntries))
        }));
      }
    }]);

    return _class;
  }(React.Component);
};

exports.middleware = function (store) {
  return function (next) {
    return function (action) {
      if (suppressMode) {
        return next(action);
      }

      var uids = store.getState().sessions.sessions;

      switch (action.type) {
        case 'SESSION_USER_DATA':
          var data = action.data;

          var charCode = data.charCodeAt(0);

          if (QUICK_SELECT_CHAR_CODE.includes(charCode)) {
            var idxQuickSel = QUICK_SELECT_CHAR_CODE.indexOf(charCode);
            if (idxQuickSel >= 0 && historyEntries.length > idxQuickSel) {
              activeItem(historyEntries[idxQuickSel]);
            }
            reset();

            // Prevent input.
            return;
          } else if (data.charCodeAt(0) === 13) {
            reset();
          } else if (data.charCodeAt(0) === 127) {
            currUserInputData = currUserInputData ? currUserInputData.slice(0, -1) : '';
            currUserInputData.length === 0 ? reset() : grepHistory();
          } else {
            currUserInputData += (data ? data : '').toLowerCase();
            currUserInputData.length === 0 ? reset() : grepHistory();
          }
          break;
        case 'SESSION_ADD':
          window.HYPER_HISTORY_TERM = currTerminal = allTerminals[action.uid];
          break;
        case 'SESSION_SET_ACTIVE':
          currPid = uids[action.uid].pid;
          window.HYPER_HISTORY_TERM = currTerminal = allTerminals[action.uid];
          setCwd(currPid);
          break;
      }
      next(action);
    };
  };
};

exports.decorateTerm = function (Term, _ref2) {
  var React = _ref2.React,
      notify = _ref2.notify;

  return function (_React$Component2) {
    _inherits(_class2, _React$Component2);

    /**
     * Bind events.
     *
     * @param {Object} props
     * @param {Object} context
     */
    function _class2(props, context) {
      _classCallCheck(this, _class2);

      var _this2 = _possibleConstructorReturn(this, (_class2.__proto__ || Object.getPrototypeOf(_class2)).call(this, props, context));

      _this2.onTerminal = _this2.onTerminal.bind(_this2, _this2);
      return _this2;
    }

    /**
     * Update Terminal.
     *
     * @param {Object} self
     * @param {Object} term
     */


    _createClass(_class2, [{
      key: 'onTerminal',
      value: function onTerminal(self, term) {
        if (self.props.onTerminal) self.props.onTerminal(term);
        allTerminals[self.props.uid] = term;
        window.HYPER_HISTORY_TERM_ALL = allTerminals;
        window.HYPER_HISTORY_TERM = currTerminal = term;
      }

      /**
       * Update Terminal view.
       *
       * @return {Object} React element
       */

    }, {
      key: 'render',
      value: function render() {
        var props = Object.assign({}, this.props, {
          onTerminal: this.onTerminal
        });
        return React.createElement(Term, props);
      }
    }]);

    return _class2;
  }(React.Component);
};

/**
 * Reset view.
 */
function reset() {
  currUserInputData = '';
  historyEntries = [];
  updateReact();
}

/**
 * Get relevent entries from history.
 *
 * @uses fuzzy_match
 * @return {Array} History entries matching user input.
 */
function getEntries(_ref3) {
  var currUserInputData = _ref3.currUserInputData,
      history = _ref3.history;

  var set = {};

  return history.split('\n').map(function (e) {
    if (e.length <= 2) {
      return undefined;
    } else if (set[e] === true) {
      return undefined;
    } else {
      set[e] = true;
      return e.toLowerCase();
    }
  }).filter(function (e) {
    return !!e && fuzzy_match(e, currUserInputData);
  }).map(function (e, i) {
    return {
      index: i + 1,
      command: e
    };
  });
}

/**
 * Cycle through the bash history.
 */
function grepHistory() {
  var file = path.join(process.env['HOME'], '.bash_history');

  fs.readFile(file, function (err, data) {
    if (!err) {
      var history = data.toString();

      historyEntries = !history ? [] : getEntries({
        currUserInputData: currUserInputData,
        history: history
      });

      updateReact();
    } else {
      console.error(err);
    }
  });
}

/**
 * Update the view.
 */
function updateReact() {
  reactHistoryNav.forceUpdate();
}

/**
 * Get the current working directory.
 *
 * @param {Number} pid
 */
function setCwd(pid) {
  var cmd = 'lsof -p ' + pid + ' | grep cwd | tr -s \' \' | cut -d \' \' -f9-';
  var callback = function callback(err, cwd) {
    // Set current pane.
    currCwd = cwd.trim();
  };

  // Get current pane's pid.
  exec(cmd, callback);
}

/**
 * Update view based on active item..
 *
 * @param {Object} entry
 */
function activeItem(entry) {
  suppressMode = true;
  var command = entry.command;
  currTerminal.io.sendString('\b'.repeat(currUserInputData.length));
  currTerminal.io.sendString(command);
  currTerminal.io.sendString('\n');
  currUserInputData = '';
  historyEntries = [];

  updateReact();

  suppressMode = false;

  currTerminal.focus();

  console.log('to active command', command);
}

/**
 * Execute a fuzzy search on the given text.
 *
 * @param {String} text
 * @param {String} search
 * @return {String} result
 */
function fuzzy_match(text, search) {
  // Parameter text is a title, search is the user's search
  // remove spaces, lower case the search so the search
  // is case insensitive
  var normalized = search.replace(/\ /g, '').toLowerCase();
  var tokens = [];
  var search_position = 0;

  // Go through each character in the text
  for (var n = 0; n < text.length; n++) {
    var text_char = text[n];
    // if we match a character in the search, highlight it
    if (search_position < search.length && text_char.toLowerCase() == normalized[search_position]) {
      text_char = '<b>' + text_char + '</b>';
      search_position += 1;
    }
    tokens.push(text_char);
  }
  // If are characters remaining in the search text,
  // return an empty string to indicate no match
  if (search_position != normalized.length) {
    return '';
  }
  return tokens.join('');
}
