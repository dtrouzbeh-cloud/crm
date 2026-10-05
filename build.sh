#!/usr/bin/env bash
# src/ parçalarını tek dosyalık prototipe (index.html) birleştirir
set -e
cd "$(dirname "$0")"
cat src/a_shell.html src/b_i18n.js src/c_data.js src/e_chart.js src/f_engine.js src/g1_views.js src/g2_case.js src/h_doc.js src/i_app.js > index.html
echo "index.html: $(wc -c < index.html) bytes"
