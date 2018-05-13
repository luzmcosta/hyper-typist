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
let currCwd = '~';
let historyEntries = [];

let suppressMode = false;

exports.decorateConfig = (config) => {
  return Object.assign({}, config, {
    css: `
      ${config.css || ''}
      .hyper-typist {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: 45ch;
        min-width: 1ch;
        max-width: 60ch;
        overflow: scroll;
        pointer-events: none;
      }
      .hyper-typist_list {
        pointer-events: initial;
      }
      .hyper-typist_list-item {
        cursor: pointer;
        line-height: 2.5ch;
      }
      .hyper-typist_list-item:after {
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
      .hyper-typist_list-item:hover {
        padding: 3px;
        border: 1px solid currentColor;
      }
      .hyper-typist_list-item:hover.hyper-typist_list-item:after {
        opacity: 0.4;
      }
      .hyper-typist_list-item:active.hyper-typist_list-item:after {
        opacity: 1;
      }
      .hyper-typist_entry-index {
        margin-right: 1ch;
        opacity: .5;
      }
    `,
  });
};

// @TODO Move presentation to its own file.
const presentation = {};

presentation.entry = (entry) => {
  // Define React, as it's used implicitly below.
  // eslint-disable-next-line no-unused-vars
  const React = presentation.view;

  return <div class="hyper-typist_list-item">
    <span class="hyper-typist_entry-index">{entry.index}</span>
    <span class="hyper-typist_entry-command">{entry.command}</span>
  </div>;
};

presentation.list = (historyEntries) => presentation.view.createElement(
  'div',
  {className: 'hyper-typist_list'},
  ...historyEntries.map(presentation.entry)
);

presentation.main = (historyEntries) => presentation.view.createElement(
  'div',
  {className: 'hyper-typist'},
  presentation.list(historyEntries)
);

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
      // Set presentation's renderer.
      presentation.view = React;

      const {customChildren} = this.props;
      const existingChildren = customChildren ? customChildren instanceof Array ? customChildren : [customChildren] : [];

      return React.createElement(
        Hyper,
        Object.assign({}, this.props, {
          // Render to .hyper_main via customInnerChildren.
          customInnerChildren: existingChildren.concat(presentation.main(historyEntries)),
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

        // Prevent input.
        return;
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

exports.decorateTerm = (Term, {React, notify}) => {
  return class extends React.Component {
    /**
     * Bind events.
     *
     * @param {Object} props
     * @param {Object} context
     */
    constructor(props, context) {
      super(props, context);
      this.onTerminal = this.onTerminal.bind(this, this);
    }

    /**
     * Update Terminal.
     *
     * @param {Object} self
     * @param {Object} term
     */
    onTerminal(self, term) {
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
 * Get relevent entries from history.
 *
 * @uses fuzzy_match
 * @return {Array} History entries matching user input.
 */
function getEntries({currUserInputData, history}) {
  let set = {};

  return history
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
}

/**
 * Cycle through the bash history.
 */
function grepHistory() {
  const file = path.join(process.env['HOME'], '.bash_history');

  fs.readFile(file, (err, data) => {
    if (!err) {
      let history = data.toString();

      historyEntries = !history ? [] : getEntries({
        currUserInputData,
        history,
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
  const cmd = `lsof -p ${pid} | grep cwd | tr -s ' ' | cut -d ' ' -f9-`;
  const callback = (err, cwd) => {
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
  let search_position = 0;

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
