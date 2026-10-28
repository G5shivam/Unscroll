#!/usr/bin/env bash
# Run the Android enforcement-core tests.
#
# Preferred (after `npx expo prebuild --platform android`):
#   cd android && ./gradlew :unscroll-blocker:testDebugUnitTest
#
# Without Gradle, using your own Kotlin compiler (kotlinc 2.x on PATH) and JUnit 4 jars:
#   JUNIT_CP=/path/junit-4.13.2.jar:/path/hamcrest-core-1.3.jar npm run test:kotlin
set -euo pipefail
cd "$(dirname "$0")/.."
command -v kotlinc >/dev/null || { echo "kotlinc not found. Use Gradle: cd android && ./gradlew :unscroll-blocker:testDebugUnitTest"; exit 2; }
: "${JUNIT_CP:?Set JUNIT_CP to junit-4.13.2.jar:hamcrest-core-1.3.jar}"
OUT=native-tests/build/kotlin-tests.jar
mkdir -p native-tests/build
kotlinc -cp "$JUNIT_CP" -include-runtime -d "$OUT" \
  modules/unscroll-blocker/android/src/main/java/com/unscroll/blocker/core/*.kt \
  modules/unscroll-blocker/android/src/test/java/com/unscroll/blocker/core/CoreTests.kt
java -Dvectors.dir="$(pwd)/shared-test-vectors" -cp "$OUT:$JUNIT_CP" com.unscroll.blocker.core.CoreTestsKt
