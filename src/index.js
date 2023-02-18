import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";
import { BrowserRouter as Router } from "react-router-dom";
import store from "./redux/store";
import {
  addSuppliers,
  addProducts,
  addProjects,
  initSession,
  updateImportState,
  initPreferences
} from "./redux/actions";

import "./index.css";
import App from "./App";
import * as serviceWorker from "./serviceWorker";

// This only works when running electron or as an app (i.e. will not work in browser).
const electron = window.electron;
const ipcRenderer = electron.ipcRenderer;

// Handle response from the electron main thread/server.

ipcRenderer.on("init-state", (event, arg) => {
  console.log("init state: ", arg);
  store.dispatch(initSession(arg));
});

ipcRenderer.on("init-preferences", (event, arg) => {
  console.log("init preferences: ", arg);
  store.dispatch(initPreferences(arg));
});

ipcRenderer.on("save-confirm", (event, arg) => {
  console.log("Save confirmed: ", arg);
});

ipcRenderer.on("save-error", (event, arg) => {
  console.log("!!!Save error: ", arg);
});

ipcRenderer.on("app-loc", (event, arg) => {
  console.log("app location: ", arg);
});

// Asynchronous file response: what to do after the main has loaded a file at the request of the renderer.
// params: event - typical event, arg - object structured like the following: {data: null or array representing rows of csv,
//                                                                            error: null or string,
//                                                                            type: null or string describing content type}
ipcRenderer.on("asynchronous-file-response", (event, arg) => {
  if (!arg.error) {
    if (arg.type === "projects") {
      store.dispatch(addProjects(arg.data));
    } else if (arg.type === "suppliers") {
      store.dispatch(addSuppliers(arg.data));
    } else if (arg.type === "products") {
      store.dispatch(addProducts(arg.data));
    }

    //store.dispatch(updateImportState({importState: null}));
    setTimeout(
      () => {
        store.dispatch(updateImportState({ importState: null }));
      },
      1000 // Arbitrary delay to give the impression it is doing something
    );
  } else {
    //store.dispatch(updateImportState({importState: 'error'}));
    setTimeout(() => {
      store.dispatch(updateImportState({ importState: arg.error }));
    }, 1000);
  }
});

ReactDOM.render(
  <Provider store={store}>
    <Router>
      <App />
    </Router>
  </Provider>,
  document.getElementById("root")
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
