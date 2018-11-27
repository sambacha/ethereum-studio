const path = require('path');
const fs = require('fs');

// Generate OpenZeppelin file structure

// Directory, where smart contracts are stored
const contractsDirectory = path.join(__dirname, '../', 'node_modules', 'openzeppelin-solidity', 'contracts');

// Directory, where json contract files are stored
const jsonDirectory = path.join(__dirname, '../', 'node_modules', 'openzeppelin-solidity', 'build', 'contracts');

// Path of the resulting file
const jsonFilePath = path.join(__dirname, '../', 'src', 'assets', 'static', 'json', 'openzeppelin.json');

// Read all Solidity files from directory
const getAllSolidityFiles = dir =>
    fs.readdirSync(dir).reduce((files, file) => {
        const name = path.join(dir, file);
        const isDirectory = fs.statSync(name).isDirectory();
        const isSolidityFile = path.extname(name) === '.sol';

        const trimmedPath = name.split("openzeppelin-solidity/")[1];
        return isDirectory
            ? [...files, ...getAllSolidityFiles(name)]
            : isSolidityFile
                ? [...files, trimmedPath ]
                : [...files]
    }, []);

// Build file tree from path
function buildTree(paths) {

    let currentPath, lastPath, node, parent, map = {
            "": {
                children: []
            }
        },
        stack = [""];

    let counter = 0;
    for (let path of paths) {
        let nodes = path.split("/");
        for (let i = 0; i < nodes.length; i++) {
            currentPath = "/" + nodes.slice(1, i + 1).join("/");
            lastPath = stack[stack.length - 1];
            parent = map[lastPath];
            if (!map[currentPath]) {
                let nameSlice = currentPath.split('/');
                let name = nameSlice[nameSlice.length-1];
                if (currentPath.endsWith('.sol')){
                    // if it is a file
                    let json = getFileJSON(jsonDirectory, name);
                    let relativePath = getLocalPath(json.sourcePath);
                    // using a dictionary to avoid duplicates
                    let dict = {};
                    let dependencies = getDependencies(json, relativePath, dict);
                    dependencies = trimDependencies(dependencies);
                    node = {
                        name: name,
                        id: counter,
                        source: json.source,
                        path: relativePath,
                        dependencies: dependencies
                    }
                } else {
                    // if it is a folder
                    node = {
                        name: i === 0 ? "contracts" : name,
                        toggled: i === 0 && true,
                        id: counter,
                        children: []
                    }
                }
                parent.children.push(node);
                map[currentPath] = node;
                counter ++
            }
            stack.push(currentPath)
        }
        stack = stack.slice(0, 1)
    }
    return map[""].children[0];
}

// Read .json file
function getFileJSON(jsonFolderPath, fileName) {
    fileName = path.parse(fileName).name.concat('.json');
    let filePath = path.join(jsonFolderPath, fileName);

    try {
        const raw = fs.readFileSync(filePath);
        return JSON.parse(raw);
    }
    catch (err) {
        try {
            // fix for one of the contracts
            fileName = "ERC20".concat(fileName);
            filePath = path.join(jsonFolderPath, fileName);
            const raw = fs.readFileSync(filePath);
            return JSON.parse(raw);
        } catch (err) {
            console.error(err)
        }
    }
}

// Get ID and dependencies from JSON
function getDependencies(json, relativePath, dict) {
    let dependenciesArray = [];
    let fileName, path;

    const importString = "import ";
    json.source.split('\n').map(line => {
        if (line.indexOf(importString) !== -1) {
            path = line.split('"')[1];
            let absolutePath = getAbsoluteDependencyPath(path, relativePath);
            let fileNameArray = path.split('/');
            fileName = fileNameArray[fileNameArray.length-1];
            // don't push the same entry twice
            if (!dict[absolutePath]) {
                dict[absolutePath] = true;
                dependenciesArray.push({ fileName, absolutePath });
            }
        }
    });

    // if no dependency, return
    if (dependenciesArray.length === 0) {
        return dependenciesArray
    }

    // Check dependencies of dependencies
    dependenciesArray.map(dependency => {
        let json = getFileJSON(jsonDirectory, dependency.fileName);
        let relativePath = getLocalPath(json.sourcePath);
        dependenciesArray = dependenciesArray.concat(getDependencies(json,relativePath, dict))
    });

    return dependenciesArray
}

// get local path after openzeppelin directory
function getLocalPath(absolutePath) {
    return absolutePath.split('openzeppelin-solidity/')[1]
}

function getAbsoluteDependencyPath(filePath, relativePath) {
    // remove contracts folder and file from end of path
    let relative = removeLastSlash(relativePath);

    filePath.split('/').map(splitPath => {
        switch (splitPath) {
            case "..":
                relative = removeLastSlash(relative);
                break;
            case ".":
                // same directory
                break;
            default:
                // reached file
                relative = path.join(relative, splitPath);
                break;
        }
    });

    return relative;
}

// remove "contracts/"
function trimPath(path) {
    return path.substr(10);
}

// run trimPath on each dependencies
function trimDependencies(dependencies) {
    let dependenciesArray = [];

    dependencies && dependencies.map(dependency => {
        const fileName = dependency.fileName;
        const absolutePath =trimPath(dependency.absolutePath);
        dependenciesArray.push({ fileName, absolutePath });
    });

    return dependenciesArray;
}

function removeLastSlash(path) {
    return path.substring(0, path.lastIndexOf("/"));
}

let tree = buildTree(getAllSolidityFiles(contractsDirectory));

fs.writeFile(jsonFilePath, JSON.stringify(tree), 'utf8', function (err) {
    if (err) throw err;
    console.log('OpenZeppelin .json successfully created.');
});
