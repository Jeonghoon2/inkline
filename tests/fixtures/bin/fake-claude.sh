#!/bin/sh
input=$(cat)
case "$input" in
  *TRAPSLEEP*) trap '' TERM; sleep 10 ;;
  *SLOWBAD*) sleep 1; printf '%s' '{"is_error":false,"structured_output":{"a":"x"}}' ;;
  *LOGIN*) printf '%s' '{"is_error":true,"result":"Not logged in · Please run /login"}'; exit 1 ;;
  *ALWAYSBAD*) printf '%s' '{"is_error":false,"structured_output":{"a":"x"}}' ;;
  *SLEEP*) sleep 5 ;;
  *BAD*) case "$input" in *'직전 답이'*) printf '%s' '{"is_error":false,"structured_output":{"a":1}}' ;; *) printf '%s' '{"is_error":false,"structured_output":{"a":"x"}}' ;; esac ;;
  *FAIL*) echo "boom" >&2; exit 3 ;;
  *) printf '%s' '{"is_error":false,"structured_output":{"a":7}}' ;;
esac
