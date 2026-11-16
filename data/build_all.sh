#!/bin/sh
set -e
cd "$(dirname "$0")/.."
python3 data/make_testdata.py
python3 oracle/oracle.py golden
python3 oracle/selftest.py
python3 tools/make_vorlage.py > /dev/null
