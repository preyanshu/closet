#!/bin/bash
# Take a native-res screenshot of your USB-connected iPhone and save it as shot.png
/tmp/opencode/pymobiledevice3/bin/pymobiledevice3 developer core-device screen-capture screenshot --userspace "${1:-shot.png}"