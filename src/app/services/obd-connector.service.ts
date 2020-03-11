/**
 * OBD connector service is a service that allows an app to connect, read, and write to and OBD scanner that is using
 * an ELM327 chip device (possibly others but havent tested).
 */

import { NgZone, Injectable } from '@angular/core';
import { BluetoothSerial } from '@ionic-native/bluetooth-serial/ngx';
import { Storage } from '@ionic/storage';
import { LoadingController } from '@ionic/angular';
import { ToastMasterService } from '../services/toast-master.service';
// import { PidsServiceService } from '../services/pids-service.service';

import { Device } from '../interfaces/device-struct';

// example of long hex 09023\r014 \r0: 49 02 01 57 42 41 \r1: 33 4E 35 43 35 35 46 \r2: 4B 34 38 34 35 34 39 \r\r
// example of short hex 09001\r49 00 55 40 00 00 \r\r

@Injectable({
  providedIn: 'root'
})

export class OBDConnectorService {

  /**
   * Creates an instance of obdconnector service.
   * @param ngZone - Imports NGZone
   * @param blueSerial - Imports the bluetooth serial class
   * @param store - Imports storage controller
   * @param loader - Imports loading screen controller
   * @param toast - Imports toast class
   */
  constructor(
    private ngZone: NgZone,
    private blueSerial: BluetoothSerial,
    private store: Storage,
    private loader: LoadingController,
    private toast: ToastMasterService,
    // private pids: PidsServiceService
  ) { }


  private macAddress: string;
  private devices: Device[];
  public processing: boolean;
  private started = false;
  private loading: HTMLIonLoadingElement;


  /**
   * To be run when the app is started.
   * Connects to the bluetooth device if one is connected.
   * @returns Promise<boolean> when it finishes
   *    -Resolve if running for the first time and boolean if it connected or not
   *    -Reject if not running for the first time
   */
  onStartUp(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.started) {
        this.started = true;
        this.getPaired();
        this.store.get('storedMac').then(data => {
          if (data != null) {
            this.Connect(data).then(success => {
              resolve(true);
            }, fail => {
              resolve(false);
            });
          } else {
            resolve(false);
          }
        });
      } else {
        reject(true);
      }
    });
  }

  /**
   * Attempts to connect via bluetooth to the OBD
   * TODO: Run usefull AT codes
   * TODO: Get the PIDs that are supported
   * @param MacAddress - Mac address of the OBD to connect to
   * @returns Promise when it has tried to connect
   */
  Connect(MacAddress: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.loader.create({
        message: 'Connecting to bluetooth'
      }).then(overlay => {
        this.loading = overlay;
        this.loading.present();
        this.blueSerial.disconnect().then(suc => {
          this.store.set('storedMac', MacAddress);

          this.blueSerial.connect(MacAddress).subscribe(success => {
            this.runATCodes();
            this.loading.dismiss();
            this.toast.connectedMessage();
            // this.pids.getSupportedPIDs();
            resolve('Was able to connect!');
          }, rejected => {
            this.loading.dismiss();
            this.toast.connectToBluetooth();
            reject('Wasn\'t able to connect!');
          });

        }, rej => {
          this.loading.dismiss();
          this.toast.disconnectFromBluetooth();
          reject('Couldn\'t disconnect from bluetooth!');
        });
      });

    });
  }

  runATCodes() {
    // ATZ
  }


  /**
   * Gets device list
   * getPaired() to be run first
   * @returns device list - list of devices paired to device
   */
  getDeviceList(): Device[] {
    return this.devices;
  }

  /**
   * Gets paired devices on phone
   * @returns Promise when it has gotten all the devices
   */
  getPaired(): Promise<string> {
    return new Promise((resolve) => {
      this.devices = [];
      this.blueSerial.list().then(
        deviceList => {
          deviceList.forEach(device => {
            // tslint:disable-next-line: object-literal-key-quotes tslint:disable-next-line: quotemark
            this.devices.push({ "name": device.name, "id": device.id, "rssi": device.class });
          });
          resolve('Ok');
        }
      );
    });
  }


  /**
   * Returns if phone is connected.  For use outside of class for data hiding
   * @returns Promise with boolean if the phone is connected
   */
  isConnected(): Promise<boolean> {
    return new Promise((resolve) => {
      this.blueSerial.isConnected().then(
        is => { resolve(true); },
        not => { resolve(false); }
      );
    });
  }

  /**
   * Writes the given request to the OBD and then subscribes for a response from the OBD
   * @param callData - Data to be written to the OBD
   * @param type - What it should be parsed as
   * @returns Promise with the response or rejection
   */
  writeThenRead(callData: string, type: string): Promise<string> {
    console.log('OBDMEDebug: Connector: start');
    return new Promise((promSuccess, promReject) => {
      this.isConnected().then(isConnect => {
        if (isConnect) {
          console.log('OBDMEDebug: Connector: isconnected');
          this.blueSerial.write(callData).then(success => {
            console.log('OBDMEDebug: Connector: write data');
            this.blueSerial.subscribe('\r\r').subscribe(data => {
              console.log('OBDMEDebug: Connector: EVENT: ' + data);
              if (data !== '') {
                console.log(data);
                // if (data === 'NO DATA\r\r') {
                if (data.includes('NO DATA')) {
                  console.log('OBDMEDebug: Connector: NO DATA');
                  // promReject('NO DATA');
                  promSuccess('NO DATA');
                } else if (data.includes('OK')) {
                  promSuccess('OK');
                } else {
                  console.log('OBDMEDebug: Connector: HAS DATA');
                  const hexCall = '4' + callData[1] + ' ' + callData.slice(2, 4) + ' ';
                  if (data.includes(hexCall)) {
                    data = data.slice(data.indexOf(hexCall) + 6);
                    if (data.includes(hexCall)) {
                      data = data.slice(0, data.indexOf(hexCall));
                    }
                    console.log('OBDMEDebug: Connector: return: ' + data + 'and: ' + this.parseHex(data, type));
                    promSuccess(this.parseHex(data, type));
                  }
                }
              }
            });

          }, failure => {
            this.toast.errorMessage('Couldnt write data!');
            promReject('Couldnt write');
          });
        } else {
          console.log('OBDMEDebug: Connector: not connected');
          this.toast.connectToBluetooth();
          promReject('Not connected to bluetooth');
        }
      });
    });
  }

  // Format data group code ammount of messages recieved \r
  // Parse data idk
  // Parse to string
  // parse to number
  // parse bitwise


  /**
   * Parses OBD data to just the useful hex
   * @param data - Raw data gotten from OBD
   * @param type - What were supposed to be parsing it into
   * @returns The parsed data
   */
  parseHex(data: string, type: string): string {
    const split = data.split('\r');
    split.forEach((section, index) => {
      if (section.indexOf(':') === 1) {
        split[index] = section.slice(3);
      }
    });
    const hexArray = split.join('').trim().split(' ');
    if (type === 'string') {
      return this.hexToString(hexArray);
    } else if (type === 'binary') {
      return this.hexToBinary(hexArray);
    } else if (type === 'number') {
      return this.hexToDecimal(hexArray);
    }
  }

  /**
   * Turns hex to string
   * @param hexArray - Array of hex codes
   * @returns Decoded string
   */
  hexToString(hexArray: string[]): string {
    const finalArray = [];
    hexArray.forEach((data, index) => {
      finalArray[index] = String.fromCharCode(parseInt(data, 16));
      if (finalArray[index] === '\u0001') {
        finalArray[index] = '';
      }
    });
    return finalArray.join('');
  }

  hexToBinary(hexArray: string[]): string {
    const finalArray = [];
    hexArray.forEach((data, index) => {
      finalArray[index] = (parseInt(data, 16).toString(2)).padStart(8, '0');
      if (finalArray[index] === '\u0001') {
        finalArray[index] = '';
      }
    });
    return finalArray.join('');
  }

  hexToDecimal(hexArray: string[]): string {
    const finalArray = [];
    hexArray.forEach((data, index) => {
      finalArray[index] = parseInt(data, 16).toString();
      if (finalArray[index] === '\u0001') {
        finalArray[index] = '';
      }
    });
    return finalArray.join('');
  }

}
