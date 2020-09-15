import { ChangeDetectorRef, Component, NgZone } from '@angular/core';
import { ImagePicker } from '@ionic-native/image-picker/ngx';
import { ActionSheetController, LoadingController, Platform, ToastController } from '@ionic/angular';
import { FilePath } from '@ionic-native/file-path/ngx';
import { File, FileEntry } from '@ionic-native/file/ngx';
import { Camera, PictureSourceType, CameraOptions } from '@ionic-native/camera/ngx';
import { HttpClient } from '@angular/common/http';
import { WebView } from '@ionic-native/ionic-webview/ngx';
import { Storage } from '@ionic/storage';
import { DomSanitizer} from '@angular/platform-browser';

const STORAGE_KEY = 'my_images';
import { finalize } from 'rxjs/operators';

declare var FileTransferManager: any;

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})

export class HomePage {

  allMedia: Array < Media > = [];
  uploader: any;
  win: any = window;

  images = [];


  constructor(private platform: Platform, private _ngZone: NgZone, private imgPicker: ImagePicker,

              private camera: Camera, private file: File, private http: HttpClient, private webview: WebView,
              private actionSheetController: ActionSheetController, private toastController: ToastController,
              private storage: Storage, private plt: Platform, private loadingController: LoadingController,
              private ref: ChangeDetectorRef, private filePath: FilePath,
              private sanitizer: DomSanitizer

              ) {
    this.platform.ready().then(() => {
      let self = this;

      self.uploader = FileTransferManager.init({
        parallelUploadsLimit: 2,
        notificationTitle: 'Upload service',
        notificationContent: 'Background upload service running'
      }, event => {
        console.log('EVENT', event);
        var correspondingMedia = self.getMediaWithId(event.id);
        if (!correspondingMedia) { return; }

        if (event.state == 'UPLOADED') {
          console.log("upload: " + event.id + " has been completed successfully");
          console.log(event.statusCode, event.serverResponse);
          correspondingMedia.updateStatus("uploaded successfully");
        } else if (event.state == 'FAILED') {
          if (event.id) {
            console.log("upload: " + event.id + " has failed");
            correspondingMedia.updateStatus("Error while uploading");
          } else {
            console.error("uploader caught an error: " + event.error);
          }
        } else if (event.state == 'UPLOADING') {
          console.log("uploading: " + event.id + " progress: " + event.progress + "%");
          correspondingMedia.updateStatus("uploading: " + event.progress + "%");
        }

        if (event.eventId)
          self.uploader.acknowledgeEvent(event.eventId);
      });
    })
  }


  private getMediaWithId(mediaId) {
    for (var media of this.allMedia) {
      if (media.id == mediaId) {
        return media;
      }
    }
    return null;
  }

  cancelUpload(media: Media): void {
    this.uploader.removeUpload(media.id, res => {
      console.log('removeUpload result: ', res);
      media.updateStatus("Aborted");
    }, err => alert('Error removing upload'));
  }

  openGallery(): void {
    var self = this;

    var options = {
      width: 200,
      quality: 25
    };

    self.imgPicker.getPictures({
      maximumImagesCount: 3
    }).then(file_uris => {
      for (var i = 0; i < file_uris.length; i++) {
        let path = this.win.Ionic.WebView.convertFileSrc(file_uris[i]);
        var media = new Media(path, this._ngZone);
        this.allMedia.push(media);

        var options: any = {
          serverUrl: "https://en7paaa03bwd.x.pipedream.net/",
          filePath: file_uris[i],
          fileKey: "file",
          id: media.id,
          notificationTitle: "Uploading image (Job 0)",
          headers: {},
          parameters: {
            colors: 1,
            faces: 1,
            image_metadata: 1,
            phash: 1,
            signature: "924736486",
            tags: "device_id_F13F74C5-4F03-B800-2F76D3C37B27",
            timestamp: 1572858811,
            type: "authenticated"
          }
        };
        console.log(options.filePath.split('/'));
        console.log(this.file.checkFile(this.file.tempDirectory, options.filePath.split('/')[16]));

        self.uploader.startUpload(options);
      }
    }, err => console.log('err: ' + err));
  }



  ngOnInit() {
    this.plt.ready().then(() => {
      this.loadStoredImages();
    });
  }

  loadStoredImages() {
    this.storage.get(STORAGE_KEY).then(images => {
      if (images) {
        let arr = JSON.parse(images);
        this.images = [];
        for (let img of arr) {
          let filePath = this.file.dataDirectory + img;
          let resPath = this.pathForImage(filePath);
          this.images.push({ name: img, path: resPath, filePath: filePath });
        }
      }
    });
  }

  pathForImage(img) {
    if (img === null) {
      return '';
    } else {
      let converted = this.webview.convertFileSrc(img);
      console.log(converted);
      return converted
      return this.sanitizer.bypassSecurityTrustUrl(converted);
    }
  }

  async presentToast(text) {
    const toast = await this.toastController.create({
      message: text,
      position: 'bottom',
      duration: 3000
    });
    toast.present();
  }

  async selectImage() {
    const actionSheet = await this.actionSheetController.create({
      header: "Select Image source",
      buttons: [{
        text: 'Load from Library',
        handler: () => {
          this.takePicture(this.camera.PictureSourceType.PHOTOLIBRARY);
        }
      },
        {
          text: 'Use Camera',
          handler: () => {
            this.takePicture(this.camera.PictureSourceType.CAMERA);
          }
        },
        {
          text: 'Cancel',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  takePicture(sourceType: PictureSourceType) {
    var options: CameraOptions = {
      quality: 100,
      sourceType: sourceType,
      saveToPhotoAlbum: false,
      correctOrientation: true
    };

    this.camera.getPicture(options).then(imagePath => {
      if (this.platform.is('android') && sourceType === this.camera.PictureSourceType.PHOTOLIBRARY) {
        this.filePath.resolveNativePath(imagePath)
            .then(filePath => {
              let correctPath = filePath.substr(0, filePath.lastIndexOf('/') + 1);
              let currentName = imagePath.substring(imagePath.lastIndexOf('/') + 1, imagePath.lastIndexOf('?'));
              this.copyFileToLocalDir(correctPath, currentName, this.createFileName());
            });
      } else {
        var currentName = imagePath.substr(imagePath.lastIndexOf('/') + 1);
        var correctPath = imagePath.substr(0, imagePath.lastIndexOf('/') + 1);
        this.copyFileToLocalDir(correctPath, currentName, this.createFileName());
      }
    });

  }

  createFileName() {
    var d = new Date(),
        n = d.getTime(),
        newFileName = n + ".jpg";
    return newFileName;
  }

  copyFileToLocalDir(namePath, currentName, newFileName) {
    this.file.copyFile(namePath, currentName, this.file.dataDirectory, newFileName).then(success => {
      this.updateStoredImages(newFileName);
    }, error => {
      this.presentToast('Error while storing file.');
    });
  }

  updateStoredImages(name) {
    this.storage.get(STORAGE_KEY).then(images => {
      let arr = JSON.parse(images);
      if (!arr) {
        let newImages = [name];
        this.storage.set(STORAGE_KEY, JSON.stringify(newImages));
      } else {
        arr.push(name);
        this.storage.set(STORAGE_KEY, JSON.stringify(arr));
      }

      let filePath = this.file.dataDirectory + name;
      let resPath = this.pathForImage(filePath);

      let newEntry = {
        name: name,
        path: resPath,
        filePath: filePath
      };

      this.images = [newEntry, ...this.images];
      this.ref.detectChanges(); // trigger change detection cycle
    });
  }

  async startUpload2(imgEntry) {



    return

    this.file.resolveLocalFilesystemUrl(imgEntry.filePath)
        .then(entry => {
          ( < FileEntry > entry).file(file => this.readFile(file))
        })
        .catch(err => {
          this.presentToast('Error while reading file.');
        });
  }

  readFile(file: any) {
    const reader = new FileReader();
    reader.onload = () => {
      const formData = new FormData();
      const imgBlob = new Blob([reader.result], {
        type: file.type
      });
      formData.append('file', imgBlob, file.name);
      this.uploadImageData(formData);
    };
    reader.readAsArrayBuffer(file);
  }

  async uploadImageData(formData: FormData) {
    const loading = await this.loadingController.create({
      message: 'Uploading image...',
    });
    await loading.present();


    this.http.post("https://codemotion.ninja/hw/upload.php", formData)
        .pipe(
            finalize(() => {
              loading.dismiss();
            })
        )
        .subscribe(res => {
          if (res['success']) {
            this.presentToast('File upload complete.')
          } else {
            this.presentToast('File upload failed.')
          }
        });
  }

  deleteImage(imgEntry, position) {
    this.images.splice(position, 1);

    this.storage.get(STORAGE_KEY).then(images => {
      let arr = JSON.parse(images);
      let filtered = arr.filter(name => name != imgEntry.name);
      this.storage.set(STORAGE_KEY, JSON.stringify(filtered));

      var correctPath = imgEntry.filePath.substr(0, imgEntry.filePath.lastIndexOf('/') + 1);

      this.file.removeFile(correctPath, imgEntry.name).then(res => {
        this.presentToast('File removed.');
      });
    });
  }

}

export class Media {

  uri: String;
  status: String;
  zone: NgZone;
  id: string;

  constructor(url: String, private _ngZone: NgZone) {
    this.uri = url;
    this.status = "uploading";
    this.zone = _ngZone;
    this.id = "" + Math.random().toString(36).substr(2, 5);
  }

  updateStatus(stat: String) {
    //in order to updates to propagate, we need be in angular zone
    //more info here:
    //https://www.joshmorony.com/understanding-zones-and-change-detection-in-ionic-2-angular-2/
    //example where updates are made in angular zone:
    //https://www.joshmorony.com/adding-background-geolocation-to-an-ionic-2-application/
    this.zone.run(() => {
      this.status = stat;
    });
  }
}
