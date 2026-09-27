const { defineConfig } = require("cypress");

module.exports = defineConfig({
  video: true,

  defaultCommandTimeout: 15000,
  pageLoadTimeout: 30000,

  e2e: {
    baseUrl: "https://studio.archphaze.com",

    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },

  component: {
    devServer: {
      framework: "next",
      bundler: "webpack",
    },
  },
});