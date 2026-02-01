import { render } from "solid-js/web";
import "solid-devtools";

import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
	throw new Error(
		"Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?",
	);
}

render(() => <App />, root);
