const fs = require('fs');
const path = require("path");
const crypto = require('crypto');
const  exifr = require('exifr');
const XMP = require("xmp-js");
const exifreader =  require('exifreader');
const  parseString = require('xml2js').parseString;

const originFolder = path.join(__dirname + '/unorganized');
const destinationFolder = path.join(__dirname + '/organized');

function readAllImages(dirname){
    return fs.readdirSync(dirname)
}

function generateImageNameHash(imangeName){
    const imageNamehash = crypto.createHash('md5').update(imangeName).digest('hex');
    return imageNamehash;
}

async function getImageMeta(imagePath){
    const imageMeta = {ok:true};
    try {
        // const meta = await exifr.parse(imagePath,true);
        const meta = await exifreader.load(imagePath);
        console.log(meta)
        // imageMeta.unix = meta.DateTimeOriginal.getTime();
        // imageMeta.year = meta.DateTimeOriginal.getFullYear();
        // imageMeta.month = meta.DateTimeOriginal.getMonth() + 1;
    } catch {
        imageMeta.ok = false;
        //add to error file;
        console.log('error no meta');
    }
    return imageMeta;
}

function getXmpData(imagePath){
    return new Promise((resolve, reject) => {
        fs.readFile(imagePath, (err, file) => {
            if (err) {
                console.log("Error while reading the file for XMP", err);
                reject(err);
            }

            let xmp = new XMP(file),
                raw = xmp.find();
                // parsed = xmp.parse();
                // xmp.parse is not parsing
            parseString(`${raw}`, function (err, result) {
                if(err){
                    console.log('ERROR XMP DATA PARSE')
                    reject(err);
                }
                resolve(result);
            });
        });
    })
}

function createUpdateYearMonthFolder(year,month){
    const res = {ok:true}
    try{
        fs.mkdirSync(`${destinationFolder}/${year}/${month}`, {mode:'0777', recursive:true});
    } catch(e) {
       res.ok = false;
    }
    return res;
}

function copyImageWithNewName(imageMeta) {
    const res = {ok:true}; 
   
    try{
        const {oldName, year, month, newName } = imageMeta; 
        const src = `${originFolder}/${oldName}`
        const dest = `${destinationFolder}/${year}/${month}/${newName}`
        fs.copyFileSync(src, dest);
        res.destination = dest
    } catch(error) {
        res.ok = false;
    }
    
    return res;

}

function addErrorToFile ( text )  {     
    fs.appendFileSync('error.txt', text);
}

async function validateImageCopy(oldName,oldPath, newPath) {
    const res = {ok:true};
    const oldMeta = await getImageMeta(oldPath);
    const newMeta = await getImageMeta(newPath);

    if (oldMeta.unix !== newMeta.unix || !newPath.includes(generateImageNameHash(oldName)) ){
        res.ok = false;
    }

    return res;
}

const awaitTimeout = delay => new Promise(resolve => setTimeout(resolve, delay));

async function runMigration() {
    const allImageNames = readAllImages(originFolder);

    for (let i = 0; i < allImageNames.length; i++) {
        await awaitTimeout(1000);
        const imageName = allImageNames[i];
        const extension = imageName.split('.')[1];
        const imageOriginPath =`${originFolder}/${imageName}`
    
        if(imageName[0]!== '.' && imageName !== 'script.js') { //hidden files and not index
            // MD5 NAMEHASH
            const imageNameHash = generateImageNameHash(imageName);

            // GET IMAGE META
            console.log(imageName);
            const imageMeta = await getImageMeta(imageOriginPath);

             // GET XMP
            //  const imageXmpMeta = await getXmpData(imageOriginPath);
            //  console.log(JSON.stringify(imageXmpMeta));

            if(!imageMeta.ok) {
                // GET XMP 
                const imageXmpMeta = await getXmpData(imageOriginPath);
                console.log(imageXmpMeta);
                addErrorToFile('\n'+ imageName + ' -> ' + 'NO META');
                continue 
            }
            
            imageMeta.newName = `${imageMeta.unix}_${imageNameHash}.${extension}`
            imageMeta.oldName = imageName;

            //CREATE DESTINATION FOLDERS IF NEEDED
            const folderRes = createUpdateYearMonthFolder(imageMeta.year,imageMeta.month)
            if(!folderRes.ok) {
                addErrorToFile('\n'+imageMeta.oldName + ' -> ' + 'NO FOLDER');
                continue
            }

            //COPY
            let copiedImageRes;
            const destinationPath = `${destinationFolder}/${imageMeta.year}/${imageMeta.month}/${imageMeta.newName}`;
            
            if(!fs.existsSync( destinationPath )){
                copiedImageRes = copyImageWithNewName(imageMeta);
            } else {
                let message = 'YES'
                const validated =  await validateImageCopy(imageName, imageOriginPath, destinationPath )
                if(!validated.ok) message = 'NO';

                addErrorToFile('\n'+imageMeta.oldName + ' -> ' + message + ' VALIDATION PASS'); 
                continue                
            }
            //VALIDATE
            const validated =  await validateImageCopy(imageName,imageOriginPath, copiedImageRes.destination )

            if(!validated.ok) {
                addErrorToFile('\n'+imageMeta.oldName + ' -> ' + 'NO VALIDATION PASS'); 
                continue
            }
            console.log(imageMeta.oldName + ' -> '+ imageMeta.newName +' SUCCESS') 
        }  
    }

}
runMigration()