let {exec} = require('child_process');
const fs = require('fs');
const path = require('path');

const CHAR_CODE_1 = 161;
const CHAR_CODE_2 = 8482;
const CHAR_CODE_3 = 163;

const QUICK_SELECT_CHAR_CODE = [CHAR_CODE_1, CHAR_CODE_2, CHAR_CODE_3];

let reactHistoryNav;

let allTerminals = {};
let currTerminal;

let currPid = '';
let currUserInputData = '';
let historyEntries = [];

let suppressMode = false;

exports.decorateConfig = (config) => {
  return Object.assign({}, config, {
    css: `
      ${config.css || ''}
      .hyper-typist {
        position: fixed;
        top: 50px;
        bottom: 50px;
        right: 0px;
        width: 30%;
        min-width: 200px;
        max-width: 400px;
        pointer-events: none;
        overflow: scroll;
      }
      .hyper-typist-list {
        pointer-events: initial;
      }
      .hyper-typist-list__item {
        padding: 4px;
        cursor: pointer;
        position: relative;
      }
      .hyper-typist-list__item:after {
        content: "";
        display: block;
        top: 0px;
        left: 0px;
        width: 100%;
        height: 100%;
        position: absolute;
        background-color: currentColor;
        opacity: 0;
        transition: opacity .1s ease;
      }
      .hyper-typist-list__item:hover {
        padding: 3px;
        border: 1px solid currentColor;
      }
      .hyper-typist-list__item:hover.hyper-typist-list__item:after {
        opacity: 0.4;
      }
      .hyper-typist-list__item:active.hyper-typist-list__item:after {
        opacity: 1;
      }
    `,
  });
};

exports.decorateHyper = (Hyper, {React}) => {
  return class extends React.Component {
    /**
     * Bind to events.
     *
     * @param {Object} props
     */
    constructor(props) {
      super(props);
      reactHistoryNav = this;
      this.state = {};
      this.handleClick = this.handleClick.bind(this);
    }

    /**
     * Execute on click event.
     *
     * @param {Object} e
     */
    handleClick(e) {}

    /**
     * Render results panel.
     *
     * @return {React}
     */
    render() {
      return React.createElement(
        Hyper,
        Object.assign({}, this.props, {
          customChildren: React.createElement(
            'div',
            {className: 'hyper-typist'},
            React.createElement(
              'div',
              {className: 'hyper-typist-list'},
              ...historyEntries.map((entry) => {
                return React.createElement(
                  'div',
                  {
                    key: entry.index,
                    className: 'hyper-typist-list__item',
                    onClick: (_) => {
                      activeItem(entry);
                    },
                  },
                  `[${entry.index}]: ${entry.command}`
                );
              })
            )
          ),
        })
      );
    }
  };
};

exports.middleware = (store) => (next) => (action) => {
  if (suppressMode) {
    return next(action);
  }

  const uids = store.getState().sessions.sessions;
  switch (action.type) {
    case 'SESSION_USER_DATA':
      const {data} = action;
      let charCode = data.charCodeAt(0);
      if (QUICK_SELECT_CHAR_CODE.includes(charCode)) {
        let idxQuickSel = QUICK_SELECT_CHAR_CODE.indexOf(charCode);
        if (idxQuickSel >= 0 && historyEntries.length > idxQuickSel) {
          activeItem(historyEntries[idxQuickSel]);
        }
        reset();
        return; // prevent input
      } else if (data.charCodeAt(0) === 13) {
        reset();
      } else if (data.charCodeAt(0) === 127) {
        currUserInputData = currUserInputData
          ? currUserInputData.slice(0, -1)
          : '';
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

/**
 * Update view.
 *
 * @param {Object} Term
 * @param {Object} param1
 * @return {React}
 */
exports.decorateTerm = (Term, {React, notify}) => {
  return class extends React.Component {
    /**
     * Bind to events.
     *
     * @param {Object} props
     * @param {Object} context
     */
    constructor(props, context) {
      super(props, context);
      this.onTerminal = this.onTerminal.bind(this, this);
    }

    /**
     * Response to a terminal event.
     *
     * @param {Object} self
     * @param {Number} term
     */
    onTerminal(self, term) {
      if (self.props.onTerminal) self.props.onTerminal(term);
      allTerminals[self.props.uid] = term;
      window.HYPER_HISTORY_TERM_ALL = allTerminals;
      window.HYPER_HISTORY_TERM = currTerminal = term;
    }

    /**
     * Update the view.
     *
     * @return {React}
     */
    render() {
      let props = Object.assign({}, this.props, {
        onTerminal: this.onTerminal,
      });
      return React.createElement(Term, props);
    }
  };
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
 * Cycle through the bash history.
 */
function grepHistory() {
  fs.readFile(path.join(process.env['HOME'], '.bash_history'), (err, data) => {
  if (!err) {
    let history = data.toString();
    let set = {};

    historyEntries = !history ?
      [] :
      history
        .split('\n')
        .map((e) => {
            if (e.length <= 2) {
            return undefined;
            } else if (set[e] === true) {
            return undefined;
            } else {
            set[e] = true;
            return e.toLowerCase();
            }
        })
        .filter((e) => !!e && fuzzy_match(e, currUserInputData))
        .map((e, i) => {
            return {
            index: i + 1,
            command: e,
            };
      });

      updateReact();
    } else {
      console.error(err);
    }
  });
}

/**
 * Force an update on the view.
 */
function updateReact() {
  reactHistoryNav.forceUpdate();
}

/**
 * Set the current shell cwd.
 *
 * @param {Number} pid
 */
function setCwd(pid) {
  exec(
    `lsof -p ${pid} | grep cwd | tr -s ' ' | cut -d ' ' -f9-`,
    (err, cwd) => {
      currCwd = cwd.trim();
    }
  );
}

/**
 * Update view based on active item..
 *
 * @param {Object} entry
 */
function activeItem(entry) {
  suppressMode = true;
  let command = entry.command;
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
  const normalized = search.replace(/\ /g, '').toLowerCase();
  const tokens = [];
  const search_position = 0;

  // Go through each character in the text
  for (let n = 0; n < text.length; n++) {
    let text_char = text[n];
    // if we match a character in the search, highlight it
    if (
      search_position < search.length &&
      text_char.toLowerCase() == normalized[search_position]
    ) {
      text_char = `<b>${text_char}</b>`;
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
