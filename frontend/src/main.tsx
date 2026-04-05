import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
import App from './App'
import { AuthProvider } from './auth'

/*
document.getElementById('root'): React searches the index.html page and says, 
"Find me the HTML element that has the ID 'root'."

ReactDOM.createRoot(...): React claims that empty <div> and says, 
"I now own this space. This is where I am going to build the app."

.render(...): React takes all of your pages, components, buttons, and 
text (your entire app) and injects them directly inside that <div id="root"></div>.
*/
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)

/*
main.tsx is the true JavaScript entry point. It does three critical things:

Mounts the React app into <div id="root">
Wraps everything in <BrowserRouter> (enables URL-based routing)
Wraps everything in <AuthProvider> (global authentication state)
*/

/*
The browser loads index.html: The very first thing the browser downloads is your index.html file.

The browser draws the empty box: The browser reads <div id="root"></div> and creates an invisible, empty box on the screen. It remembers exactly where this box is.

The browser loads the script: The browser sees <script src="/src/main.tsx"></script> and downloads your React code.

The React code asks the browser for directions: Inside main.tsx, there is the command document.getElementById('root'). 
This is actually a built-in browser command. React is essentially asking the browser: 
"Hey Browser, look at the HTML page you just drew on the screen. Did you draw anything with the ID of 'root'?"

The browser hands it over: The browser says, "Yes, right here," and points React to that specific <div>.
*/