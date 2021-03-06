const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const inquirerOptions = require('./inquirerOptions.js');

/**
 * Returns a object with the defaults added to the assigned settings.
 * Userful for making sure that whenever the user has deleted settings from their
 * copy that the defaults are still available.
 * @param { string } defaultSettingsPath path to orignal file with defaults
 * @param { object } assignedSettings settings imported from the users settings
 */
const fillBlanksWithDefaults = (defaultSettingsPath, assignedSettings) => {
  const defaultConfig = JSON.parse(fs.readFileSync(defaultSettingsPath));
  const mergedSettings = Object.assign(defaultConfig, JSON.parse(assignedSettings));
  return mergedSettings;
};

/**
 * Finds the next unused name in the directory to save a backup file
 * @param { string } location the path to the directory of intesting
 * @param { string } baseName the original name of the file being backed up
 * @example findValidBackupName('somePath', exam.js) returns exam.backup.js
 * @example findValidBackupName('somePath', exam.js) returns exam.backup0.js
 * @example findValidBackupName('somePath', exam.js) returns exam.backup1.js
 * @return { string } a string taking the form of a unused backup name
 */
const findValidBackupName = (location, baseName) => {
  const backupExt = path.extname(baseName);
  let backupName = path.basename(baseName, backupExt).concat('.backup');
  let filecount = 0;
  if (fs.existsSync(location.concat(backupName).concat(backupExt))) {
    while (fs.existsSync(location.concat(backupName).concat(filecount).concat(backupExt))) {
      filecount += 1;
    }
    backupName = backupName.concat(filecount.toString());
  }
  return backupName.concat(backupExt);
};
/**
 * Copys a files from source to destination and then executes a callback
 * @param { string } source path to the file you want to copy
 * @param { string } destination path to copy destination
 * @param { string } cb callback function to execute upon completion
 */
const copyFile = (source, destination, modifier, cb) => fs.readFile(source, (err, original) => {
  if (err) throw new Error(err);
  let fileToWrite = original.toString();
  if (typeof modifier === 'function') fileToWrite = modifier(original);
  return fs.writeFile(destination, fileToWrite, (writeErr) => {
    if (writeErr) throw writeErr;
    if (typeof cb === 'function') {
      cb();
    }
  });
});

/**
 * Overwrites target file with specified file contents
 * Prompts the user to make sure the want to complete this operations before doing it
 * If the user confirms then asks the user if they want to save a backup of current file
 * @param { string } pathData path to file to overwrite
 * @param { string } source path to source file to copy to pathData
 */
const refreshFile = (oldFile, source, additionsToTemplate, error) => {
  const fileName = path.basename(oldFile);
  const pathData = path.dirname(oldFile).concat('/');
  const corruptFilePrompt = inquirerOptions.corruptFilePrompt(fileName);
  const confirmDeletePrompt = inquirerOptions.confirmDeletePrompt(fileName);

  inquirer
    .prompt(corruptFilePrompt)
    .then((answer) => {
      /* eslint-disable-next-line no-console */
      if (answer.delete === false) console.error(error.message);
      if (answer.delete === true) {
        inquirer
          .prompt(confirmDeletePrompt.questions)
          .then((how) => {
            if (how.method === confirmDeletePrompt.options[0]) {
              // do nothing
            } else if (how.method === confirmDeletePrompt.options[1]) {
              const backupName = findValidBackupName(pathData, fileName);
              copyFile(
                oldFile,
                pathData.concat(backupName),
                null,
                () => copyFile(
                  pathData.concat(source),
                  oldFile,
                  additionsToTemplate,
                ),
              );
            } else if (how.method === confirmDeletePrompt.options[2]) {
              copyFile(pathData.concat(source), oldFile, additionsToTemplate);
            }
          });
      }
    });
};
/**
 * Finds the closet gutenRC.json file at or above current directory and
 * returns the JSON Object containing the users settings merged with the defaults
 * @return { object } contents of .gutenRC.json with the absolute path
 * @return { boolean } false if no .gutenrc have being initiated
 * added as a key or false
 */
const getRC = () => {
  let rcpath = false;
  let targetPath = fs.realpathSync('./');
  while (rcpath === false && targetPath !== path.dirname(targetPath)) {
    const results = fs.readdirSync(targetPath).filter(file => file === '.gutenrc.json');
    rcpath = results.length !== 0;
    if (!rcpath) {
      targetPath = path.dirname(targetPath);
    }
  }
  if (rcpath === true) {
    const gutenrc = fs.readFileSync(targetPath.concat('/.gutenrc.json'));
    let gutenfolder;
    try {
      gutenfolder = JSON.parse(gutenrc).apiDir;
    } catch (error) {
      refreshFile(targetPath.concat('/.gutenrc.json'),
        'client/dist/.gutenRCTemplate.json', null, error);
      return false;
    }
    if (gutenfolder === undefined) {
      throw new Error('Your gutenrc folder seems to be missing a apiDir key indicating where the folder should be. Either add a key of apiDir with a value of the name of your api folder or delete the RC file and reinitialize.  A backup of your Api Folder will be created as [folderName].backup#.');
    }
    const RCTemplatePath = path.dirname(__dirname).concat('/client/dist/.gutenRCTemplate.json');
    const missingValuesFilled = fillBlanksWithDefaults(RCTemplatePath, gutenrc);
    return Object.assign({ absPath: targetPath.concat('/') }, missingValuesFilled);
  }
  throw new Error('You have not initialized gutendocs.  Call "gutendocs init"');
};

/**
 * Function used to test a filename as to whether or not we want to include it
 * Used when filtering a list of files that were read using fs.readDir
 * @param { string } file name of the file being checked
 * @param { string } dirPath directory of the files being checked
 * @param { array } toIgnore array of filenames to ignore
 * @return { boolean } indicates whether or not this is a file of interest
 */
const filterFiles = (file, dirPath, toIgnore) => {
  const fieslToIgnore = toIgnore || ['.DS_Store', '.gutenRCTemplate.json'];
  if (fieslToIgnore.includes(file)) return false;
  if (fs.lstatSync(dirPath.concat(file)).isDirectory()) return false;
  return true;
};

/**
 * Generates the files needed to have a gutendocs API
 * by copying them from the gutendocs client folder
 * @param { string } destination the path to the directory the API folder should be made in
 * @param { string } dirName the name of the folder the API dir should have
 * @param { boolean } backup whether or not to make a backup folder
 */
const generateFilesaveArray = (destination, dirName, backup) => {
  const filesToWrite = [];
  const srcPath = path.dirname(__dirname).concat('/client/dist/');
  const srcFiles = fs.readdirSync(srcPath).filter(file => filterFiles(file, srcPath));
  srcFiles.forEach(file => filesToWrite.push(
    {
      content: fs.readFileSync(srcPath.concat(file)),
      writePath: file,
    },
  ));

  const sortersPath = srcPath.concat('CustomSorters/');
  const sorters = fs.readdirSync(sortersPath).filter(file => filterFiles(file, sortersPath));
  const customPathToSortWrapper = '/* eslint-disable-next-line import/no-absolute-path */\n'
  + `const { sortWrapper } = require('${__dirname}/sorters/sorters.js');\n`;
  sorters.forEach(sorter => filesToWrite.push(
    {
      content: customPathToSortWrapper.concat(fs.readFileSync(sortersPath.concat(sorter))),
      writePath: 'CustomSorters/'.concat(sorter),
    },
  ));

  const imgPath = srcPath.concat('imgs/');
  const images = fs.readdirSync(imgPath).filter(file => filterFiles(file, imgPath));
  images.forEach(img => filesToWrite.push(
    {
      content: fs.readFileSync(imgPath.concat(img)),
      writePath: 'imgs/'.concat(img),
    },
  ));

  const themePath = srcPath.concat('Themes/');
  const themes = fs.readdirSync(themePath).filter(theme => filterFiles(theme, themePath));
  themes.forEach(theme => filesToWrite.push(
    {
      content: fs.readFileSync(themePath.concat(theme)),
      writePath: 'Themes/'.concat(theme),
    },
  ));

  const APIdir = destination.concat(dirName);
  if (fs.existsSync(APIdir) && backup) {
    const BackupDirName = findValidBackupName(destination, dirName);
    fs.renameSync(APIdir, destination.concat(BackupDirName));
    fs.mkdirSync(APIdir);
  }

  if (!fs.existsSync(APIdir)) {
    fs.mkdirSync(APIdir);
  }

  const sortersDir = APIdir.concat('CustomSorters/');
  if (!fs.existsSync(sortersDir)) fs.mkdirSync(sortersDir);

  const imgDir = APIdir.concat('imgs/');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir);

  const themeDir = APIdir.concat('Themes/');
  if (!fs.existsSync(themeDir)) fs.mkdirSync(themeDir);

  filesToWrite.forEach(file => fs.writeFileSync(APIdir.concat(file.writePath), file.content));
};

/**
 * refreshes the API with all the settings to the defauts
 * @param { object } gutenrc the gutenrc object the defines the users settings
 * @param { boolean } backup whether or not to make a backup folder
 */
const refreshAPI = (gutenrc, backup) => {
  generateFilesaveArray(gutenrc.absPath, gutenrc.apiDir, backup);
};

/**
 * adds .gutenignore to the ignore language in vscodes autodetect language settings
 * only implimented for vscode
 * @param { string } absPath path to the root directory gutendocs is being created in
 */
const addIgnoreToLangSettings = (absPath) => {
  const vscodePath = absPath.concat('.vscode/');
  if (fs.existsSync(vscodePath)) {
    const gutenignoreLangSetting = { 'files.associations': { '.gutenignore': 'ignore' } };
    let currentSettings = {};
    let readErr = false;
    if (fs.existsSync(vscodePath.concat('settings.json'))) {
      try {
        currentSettings = JSON.parse(fs.readFileSync(vscodePath.concat('settings.json')));
      } catch (err) {
        readErr = err;
      }
    }
    if (!readErr) {
      const newSettings = Object.assign(currentSettings, gutenignoreLangSetting);
      fs.writeFileSync(vscodePath.concat('settings.json'), JSON.stringify(newSettings, null, 2));
    }
  }
};

/**
 * Generates a API folder as well as a gutenRC file
 * @param { string } relPath the directory that the user wants to make the APIDir
 * @param { string } apiDir the desired name of the APIDir
 */
const generateAPIFrame = (relPath, apiDir) => {
  const srcPath = path.dirname(__dirname).concat('/');
  const absPath = fs.realpathSync(relPath).concat('/');
  if (!fs.existsSync(relPath.concat('.gutenrc.json'))) {
    generateFilesaveArray(absPath, apiDir);
    const templateRC = fs.readFileSync(srcPath.concat('client/dist/.gutenRCTemplate.json'));
    const mergedRC = Object.assign(JSON.parse(templateRC), {
      apiDir,
    });
    fs.writeFileSync(absPath.concat('.gutenrc.json'), JSON.stringify(mergedRC, null, 2));

    const gutenIgnoreContents = '#ignore your dependancies\n'
    + 'node_modules\n'
    + '#ignore hidden folders like .git\n'
    + '.*\n'
    + '#ignore your generated API folder\n'
    + `${apiDir}\n\n`
    + '#additional folders and files to ignore\n';
    if (!fs.existsSync(absPath.concat('.gutenignore'))) {
      fs.writeFileSync(absPath.concat('.gutenignore'), gutenIgnoreContents);
    }
    addIgnoreToLangSettings(absPath);
  } else {
    throw Error('You have already initialized gutendocs in this Repo.  If you want to refresh the files call "gutendocs reset [--backup, -b]"');
  }
};

/**
 * Sets the verbosity level in the local and sometimes the global settings
 * @param { number } level the desired verbosity level
 * @param { object } gutenrc the local gutenRC settings
 * @param { boolean } globally whether or not the global settings should also be set
 */
const setVerbosity = (level, gutenrc, globally) => {
  if (typeof level === 'number' && level >= 0 && level <= 5) {
    if (gutenrc) {
      let newSettings = JSON.parse(fs.readFileSync(gutenrc.absPath.concat('.gutenrc.json')));
      newSettings.verbosity = level;
      newSettings = JSON.stringify(newSettings, null, 2);
      fs.writeFileSync(gutenrc.absPath.concat('.gutenrc.json'), newSettings);
    }
    if (globally) {
      const pathToGlobal = path.dirname(__dirname).concat('/client/dist/.gutenRCTemplate.json');
      let globalSettings = JSON.parse(fs.readFileSync(pathToGlobal));
      globalSettings.verbosity = level;
      delete globalSettings.absPath;
      globalSettings = JSON.stringify(globalSettings, null, 2);
      fs.writeFileSync(pathToGlobal, globalSettings);
    }
    return;
  }
  throw new Error('Verbosity level must be a number from 0 to 5');
};

/**
 * Console.logs all the themes available.  If verbosity is above 3 also lists contents of theme
 * @param { object } gutenrc gutenrc settings file
 */
const listThemes = (gutenrc) => {
  const themeFolderPath = gutenrc.absPath.concat(gutenrc.apiDir).concat('Themes/');
  const themes = fs.readdirSync(themeFolderPath).filter(file => path.extname(file) === '.json');
  themes.forEach((themeName) => {
    const theme = JSON.parse(fs.readFileSync(themeFolderPath.concat(themeName)));
    process.stdout.write(`${path.basename(themeName, '.json')}:`);
    process.stdout.cursorTo(10);
    process.stdout.write(`${theme.description}\n`);
    delete theme.description;
    if (gutenrc.verbosity >= 3) {
      /* eslint-disable-next-line no-console */
      console.log(theme);
    }
  });
};

/**
 * Create the a string format of the design settings file with the passed
 * in object as the export value of configData
 * @param { string } newDesign stringified JSON of the desired config settings
 */
const addDesignSettingsTemplate = newDesign => 'const configData = '
  + `${newDesign}`
  + ';\ntry {\n  window.configData = configData;\n} catch (error) {\n  module.exports = configData;\n}';

/**
 * Sets the design settings to the desired theme
 * @param { object } gutenrc the gutenrc settings
 * @param { string } themeName the name of the theme you want to set
 */
const setTheme = (gutenrc, themeName) => {
  const pathToDesignSettings = gutenrc.absPath.concat(gutenrc.apiDir).concat('designSettings.js');
  /* eslint-disable-next-line */
  const designSettings = require(pathToDesignSettings);
  const pathToTheme = gutenrc.absPath.concat(`${gutenrc.apiDir}Themes/${themeName}.json`);
  const themeToLoad = JSON.parse(fs.readFileSync(pathToTheme));
  delete themeToLoad.description;
  const newDesignSettings = JSON.stringify(Object.assign(designSettings, themeToLoad), null, 2);
  fs.writeFileSync(pathToDesignSettings, addDesignSettingsTemplate(newDesignSettings));
};

module.exports.setTheme = setTheme;
module.exports.listThemes = listThemes;
module.exports.setVerbosity = setVerbosity;
module.exports.generateAPIFrame = generateAPIFrame;
module.exports.refreshAPI = refreshAPI;
module.exports.refreshFile = refreshFile;
module.exports.generateFilesaveArray = generateFilesaveArray;
module.exports.getRC = getRC;