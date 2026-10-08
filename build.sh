#!/bin/bash

MVN_OPTS="-Duser.home=/var/maven -T 4"

if [ ! -e node_modules ]
then
  mkdir node_modules
fi

case `uname -s` in
  MINGW* | Darwin*)
    USER_UID=1000
    GROUP_UID=1000
    ;;
  *)
    if [ -z ${USER_UID:+x} ]
    then
      USER_UID=`id -u`
      GROUP_GID=`id -g`
    fi
esac

# options
SPRINGBOARD="recette"
for i in "$@"
do
case $i in
    -s=*|--springboard=*)
    SPRINGBOARD="${i#*=}"
    shift
    ;;
    *)
    ;;
esac
done

# If DEBUG env var is set to "true" then set -x to enable debug mode
if [ "$DEBUG" == "true" ]; then
	set -x
	EDIFICE_CLI_DEBUG_OPTION="--debug"
else
	EDIFICE_CLI_DEBUG_OPTION=""
fi

init() {
  me=`id -u`:`id -g`
  echo "DEFAULT_DOCKER_USER=$me" > .env

  # If CLI_VERSION is empty set to latest
  if [ -z "$CLI_VERSION" ]; then
    CLI_VERSION="latest"
  fi
  # Create a build.compose.yaml file from following template
  cat <<EOF > build.compose.yaml
services:
  edifice-cli:
    image: opendigitaleducation/edifice-cli:$CLI_VERSION
    user: "$DEFAULT_DOCKER_USER"
EOF
  # Copy /root/edifice from edifice-cli container to host machine
  docker compose -f build.compose.yaml create edifice-cli
  docker compose -f build.compose.yaml cp edifice-cli:/root/edifice ./edifice
  docker compose -f build.compose.yaml rm -fsv edifice-cli
  rm -f build.compose.yaml
  chmod +x edifice
  ./edifice version $EDIFICE_CLI_DEBUG_OPTION
}

clean () {
  docker compose run --rm maven mvn $MVN_OPTS clean
}

install () {
  docker compose run --rm maven mvn $MVN_OPTS install -DskipTests
}

test () {
  docker compose run --rm maven mvn $MVN_OPTS test
}

buildNode () {
  #try jenkins branch name => then local git branch name => then jenkins params
  echo "[buildNode] Get branch name from jenkins env..."

  # ENTCORE_EXPLICIT=true seulement si une version d'entcore a été EXPLICITEMENT demandée
  # (FRONT_BRANCH/FRONT_TAG, ex. Jenkins) — voir plus bas : dans ce seul cas BRANCH_NAME
  # désigne un tag npm entcore réel à installer. Sans ça, BRANCH_NAME retombe sur la branche
  # git LOCALE DU MODULE (ex. "4.3.6-patched-dev") qui n'a jamais été un tag entcore publié
  # → `npm install entcore@4.3.6-patched-dev` échoue toujours (ETARGET). Le CI du module
  # (.github/workflows/build-and-publish.yml) ne fait d'ailleurs jamais ce npm rm/install
  # ciblé : simple `npm install`, en confiance sur la version déjà pinnée dans package.json.
  ENTCORE_EXPLICIT=false

  if [ ! -z "$FRONT_BRANCH" ]; then
    echo "[buildNode] Get tag name from jenkins param... $FRONT_BRANCH"
    BRANCH_NAME="$FRONT_BRANCH"
    ENTCORE_EXPLICIT=true
  else
    BRANCH_NAME=`echo $GIT_BRANCH | sed -e "s|origin/||g"`
    if [ "$BRANCH_NAME" = "" ]; then
      echo "[buildNode] Get branch name from git..."
      BRANCH_NAME=`git branch | sed -n -e "s/^\* \(.*\)/\1/p"`
    fi
    if [ ! -z "$FRONT_TAG" ]; then
      echo "[buildNode] Get tag name from jenkins param... $FRONT_TAG"
      BRANCH_NAME="$FRONT_TAG"
      ENTCORE_EXPLICIT=true
    fi
    if [ "$BRANCH_NAME" = "" ]; then
      echo "[buildNode] Branch name should not be empty!"
      exit -1
    fi
  fi

  if [ "$ENTCORE_EXPLICIT" = false ] || [ "$BRANCH_NAME" = 'master' ] || [ "$BRANCH_NAME" = 'v3.6.1.x' ]; then
      echo "[buildNode] Use entcore version from package.json ($BRANCH_NAME)"
      case `uname -s` in
        MINGW*)
          docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install --no-bin-links && npm update entcore && node_modules/gulp/bin/gulp.js build"
          ;;
        *)
          docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install && npm update entcore && node_modules/gulp/bin/gulp.js build --springboard=/home/node/$SPRINGBOARD"
      esac
  else
      echo "[buildNode] Use entcore tag $BRANCH_NAME"
      case `uname -s` in
        MINGW*)
          docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install --no-bin-links && npm rm --no-save entcore && npm install --no-save entcore@$BRANCH_NAME && node_modules/gulp/bin/gulp.js build"
          ;;
        *)
          docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install && npm rm --no-save entcore && npm install --no-save entcore@$BRANCH_NAME && node_modules/gulp/bin/gulp.js build --springboard=/home/node/$SPRINGBOARD"
      esac
  fi

}

# IHM React (sous-projet frontend/) : ses fichiers portent une empreinte de contenu et la vue est
# GÉNÉRÉE par Vite, qui y inscrit les bons noms. Elle ne peut donc pas venir de view-src/, que gulp
# recopie — d'où cette étape séparée, APRÈS buildNode.
buildReactFrontend () {
  if [ ! -d ./frontend ] ; then return 0 ; fi
  echo "Building React frontend (frontend/)..."
  ( cd frontend \
    && node scripts/refresh-open-ent-lock.mjs \
    && pnpm install --no-frozen-lockfile \
    && pnpm build ) || exit 1
  mkdir -p ./src/main/resources/public ./src/main/resources/view
  cp -r ./frontend/dist/public/. ./src/main/resources/public/
  cp ./frontend/dist/index.html ./src/main/resources/view/exercizer-react.html
}

publish() {
  version=`docker compose run --rm maven mvn $MVN_OPTS help:evaluate -Dexpression=project.version -q -DforceStdout`
  level=`echo $version | cut -d'-' -f3`
  case "$level" in
    *SNAPSHOT) export nexusRepository='snapshots' ;;
    *)         export nexusRepository='releases' ;;
  esac

  docker compose run --rm  maven mvn $MVN_OPTS -DrepositoryId=ode-$nexusRepository -DskipTests --settings /var/maven/.m2/settings.xml deploy
}

if [ ! -e .env ]; then
  init
fi

watch () {
  docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "node_modules/gulp/bin/gulp.js watch --springboard=/home/node/$SPRINGBOARD"
}

for param in "$@"
do
  case $param in
    init)
      init
      ;;
    clean)
      clean
      ;;
    buildNode)
      buildNode && buildReactFrontend
      ;;
    buildReactFrontend)
      buildReactFrontend
      ;;
    install)
      buildNode && buildReactFrontend && install
      ;;
    test)
      test
      ;;
    watch)
      watch
      ;;
    publish)
      publish
      ;;
    *)
      echo "Invalid argument : $param"
  esac
  if [ ! $? -eq 0 ]; then
    exit 1
  fi
done

