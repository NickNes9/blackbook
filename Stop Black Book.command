#!/bin/bash
cd "$(dirname "$0")" || exit 1
exec bash './Black Book.command' --stop
