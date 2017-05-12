'use babel'

import Notifier from './notifier'
import StatusView from './views/status'
import Terminal from './terminal'
import TerminalView from './terminal-view'
import airbrake from './airbrake'
import atomHelper from './atom-helper'
import auth from './auth'
import bus from './event-bus'
import colors from './colors'
import config from './config'
import localStorage from './local-storage'
import logout from './logout'
import remoteNotification from './remote-notification'
import token from './token'
import updater from './updater'
import {CompositeDisposable} from 'atom'
import {name, version} from '../package.json'
import {shell} from 'electron'

window.LEARN_IDE_VERSION = version;

var ABOUT_URL = `${config.learnCo}/ide/about`;

export default {
  token,

  activate(state) {
    this.subscriptions = new CompositeDisposable;

    this.activateMonitor();
    this.checkForV1WindowsInstall();
    this.registerWindowsProtocol();
    this.disableFormerPackage();

    colors.apply();

    this.subscribeToLogin();

    this.waitForAuth = auth().then(() => {
      this.activateIDE(state);
    }).catch(() => {
      this.activateIDE(state);
    });
  },

  activateIDE(state) {
    this.isRestartAfterUpdate = (localStorage.get('restartingForUpdate') === 'true');

    if (this.isRestartAfterUpdate) {
      updater.didRestartAfterUpdate();
      localStorage.delete('restartingForUpdate');
    }

    this.activateTerminal();
    this.activateStatusView(state);
    this.activateEventHandlers();
    this.activateSubscriptions();
    this.activateNotifier();
    this.activateUpdater();
    this.activateRemoteNotification();
  },

  activateTerminal() {
    this.term = new Terminal({
      host: config.host,
      port: config.port,
      path: config.path,
      token: this.token.get()
    });

    this.termView = new TerminalView(this.term);
  },

  activateStatusView(state) {
    this.statusView = new StatusView(state, this.term);
  },

  activateEventHandlers() {
    atomHelper.trackFocusedWindow();

    // listen for learn:open event from other render processes (url handler)
    bus.on('learn:open', lab => {
      this.learnOpen(lab.slug);
      atom.getCurrentWindow().focus();
    });

    // tidy up when the window closes
    atom.getCurrentWindow().on('close', () => this.cleanup());
  },

  activateSubscriptions() {
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'learn-ide:open': e => this.learnOpen(e.detail.path),
      'learn-ide:toggle-terminal': () => this.termView.toggle(),
      'learn-ide:toggle-popout': () => this.termView.focusPopoutEmulator(),
      'learn-ide:toggle-focus': () => this.termView.toggleFocus(),
      'learn-ide:focus': () => this.termView.focusEmulator(),
      'learn-ide:toggle:debugger': () => this.term.toggleDebugger(),
      'learn-ide:reset-connection': () => this.term.reset(),
      'learn-ide:view-version': () => this.viewVersion(),
      'learn-ide:update-check': () => updater.checkForUpdate(),
      'learn-ide:about': () => this.about()
    }));

    this.subscriptions.add(atom.commands.add('.terminal', {
      'core:copy': () => this.termView.clipboardCopy(),
      'core:paste': () => this.termView.clipboardPaste(),
      'learn-ide:reset-font-size': () => this.termView.resetFontSize(),
      'learn-ide:increase-font-size': () => this.termView.increaseFontSize(),
      'learn-ide:decrease-font-size': () => this.termView.decreaseFontSize(),
      'learn-ide:clear-terminal': () => this.term.send('')
    }));

    atom.config.onDidChange(`${name}.terminalColors.basic`, () => colors.apply())

    atom.config.onDidChange(`${name}.terminalColors.ansi`, () => colors.apply())

    atom.config.onDidChange(`${name}.terminalColors.json`, ({newValue}) => {
      colors.parseJSON(newValue);
    });

    atom.config.onDidChange(`${name}.notifier`, ({newValue}) => {
      newValue ? this.activateNotifier() : this.notifier.deactivate()
    });

    var openPath = localStorage.get('learnOpenLabOnActivation');
    if (openPath) {
      localStorage.delete('learnOpenLabOnActivation');
      this.learnOpen(openPath);
    }
  },

  activateNotifier() {
    if (atom.config.get(`${name}.notifier`)) {
      this.notifier = new Notifier(this.token.get());
      this.notifier.activate();
    }
  },

  activateUpdater() {
    if (!this.isRestartAfterUpdate) {
      return updater.autoCheck();
    }
  },

  activateMonitor() {
   this.subscriptions.add(atom.onWillThrowError(err => {
     airbrake.notify(err.originalError);
   }))
 },

  activateRemoteNotification() {
    remoteNotification();
  },

  deactivate() {
    localStorage.delete('disableTreeView');
    localStorage.delete('terminalOut');
    this.termView = null;
    this.statusView = null;
    this.subscriptions.dispose();
    this.term.emitter.removeAllListeners();
  },

  subscribeToLogin() {
    this.subscriptions.add(atom.commands.add('atom-workspace',
      {'learn-ide:log-in-out': () => this.logInOrOut()})
    );
  },

  cleanup() {
    atomHelper.cleanup();
  },

  consumeStatusBar(statusBar) {
    this.waitForAuth.then(() => this.addLearnToStatusBar(statusBar));
  },

  logInOrOut() {
    (this.token.get() == null) ? atomHelper.resetPackage() : logout()
  },

  checkForV1WindowsInstall() {
    require('./windows');
  },

  registerWindowsProtocol() {
    if (process.platform === 'win32') { require('./protocol') }
  },

  disableFormerPackage() {
    var pkgName = 'integrated-learn-environment';

    if (!atom.packages.isPackageDisabled(pkgName)) {
      atom.packages.disablePackage(pkgName);
    }
  },

  addLearnToStatusBar(statusBar) {
    var leftTiles = Array.from(statusBar.getLeftTiles());
    var rightTiles = Array.from(statusBar.getRightTiles());
    var rightMostTile = rightTiles[rightTiles.length - 1];

    var priority = ((rightMostTile != null ? rightMostTile.priority : undefined) || 0) - 1;
    statusBar.addRightTile({item: this.statusView, priority});
  },

  learnOpen(labSlug) {
    if (labSlug != null) {
      this.term.send(`learn open ${labSlug.toString()}\r`);
    }
  },

  about() {
    shell.openExternal(ABOUT_URL);
  },

  viewVersion() {
    atom.notifications.addInfo(`Learn IDE: v${version}`);
  }
};
