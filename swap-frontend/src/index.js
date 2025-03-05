import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import './styles/styles.css';
import { Buffer } from 'buffer';
window.Buffer = Buffer;

ReactDOM.render(<App />, document.getElementById('root'));
