/**
 * PostCSS pipeline configuration for the frontend build.
 * Loads Tailwind CSS first, then Autoprefixer for cross-browser vendor prefixing.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
