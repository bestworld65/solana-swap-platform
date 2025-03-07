import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import { Buffer } from 'buffer';
import './styles.css';
window.Buffer = Buffer;

ReactDOM.render(<App />, document.getElementById('root'));
