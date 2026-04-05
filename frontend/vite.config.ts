// imports a helper function from Vite. Wrapping your configuration in defineConfig() 
// provides intelligent code autocomplete and type-checking in your code editor.
import { defineConfig } from 'vite'
// imports the official React plugin for Vite
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // forces the development server to run specifically on port 5173
    port: 5173,
    // important setting for your Dockerized setup. By default, Vite only 
    // exposes the server to localhost (127.0.0.1). Setting host: true tells Vite to 
    // listen on all network interfaces (equivalent to 0.0.0.0). Because your frontend is 
    // running inside a Docker container, it needs this setting so that your host machine 
    // (your actual computer) can access the frontend at http://localhost:5173. 
    // If this were missing, the app would only be accessible from inside the container itself.
    host: true
  }
})
