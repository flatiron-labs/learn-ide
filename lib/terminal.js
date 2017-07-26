'use babel'

import { EventEmitter } from 'events'
import { Socket } from 'phoenix'
import { name } from '../package.json'

export default class Terminal {
  constructor(args={}) {
    this.emitter = new EventEmitter();

    this.host = args.host;
    this.port = args.port;
    this.path = args.path;
    this.token = args.token;
    this.username = args.username;
    this.labSlug = args.labSlug;

    this.hasFailed = false;

    this.connect();
  }

  connect() {
    this.socket = new Socket(this.url(), {params: {token: this.token, client: 'atom'}})
    this.socket.connect()
    this.joinChannel()
  }

  joinChannel() {
    this.channel = this.socket.channel(this.channelName())

    this.channel.join()
      .receive('error', (e) => {
        atom.emitter.emit('learn-ide:error-joining-channel')
      })
      .receive('ok', (e) => {
        atom.emitter.emit('learn-ide:did-join-channel', this.channel)
        this.emit('open', e)
      })

    this.channel.on('terminal_output', ({terminal_output}) => {
      var decoded = new Buffer(terminal_output, 'base64').toString()
      this.emit('message', decoded)
    })

    this.channel.onClose(e => this.emit('close', e))

    this.channel.onError((e) => {
      this.channel.leave()

      this.emit('error', e)
    })
  }

  emit() {
    return this.emitter.emit.apply(this.emitter, arguments);
  }

  on() {
    return this.emitter.on.apply(this.emitter, arguments);
  }

  url() {
    var {version} = require('../package.json');
    var protocol = (this.port === 443) ? 'wss' : 'ws';

    return `${protocol}://${this.host}:${this.port}/${this.path}`;
  }

  channelName() {
    let defaultOpen = atom.config.get(`${name}.openOnHome`) ? 'home' : 'temporary'

    return `session:${this.username}:${this.labSlug || defaultOpen}`
  }

  reset() {
    this.joinChannel()
  }

  send(msg) {
    var encoded = new Buffer(msg).toString('base64')
    this.channel.push('terminal_input', {data: encoded})
  }
}
