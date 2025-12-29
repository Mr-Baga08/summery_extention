const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {},
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'background.js', to: 'background.js' },
        { from: 'content.js', to: 'content.js' },
        { from: 'popup.html', to: 'popup.html' },
        { from: 'popup.js', to: 'popup.js' },
        { from: 'popup.css', to: 'popup.css' },
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'icons', to: 'icons' },
        { from: 'lib', to: 'lib' }
      ]
    })
  ]
};
