package com.offlinemesh

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.os.Build
import android.os.ParcelUuid
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID

class BlePeripheralModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "BlePeripheral"
        const val MESSAGE_EVENT = "OfflineMeshMessage"

        private val SERVICE_UUID =
            UUID.fromString("12345678-1234-1234-1234-123456789abc")

        private val CHAR_UUID =
            UUID.fromString("87654321-4321-4321-4321-cba987654321")
    }

    private val bluetoothManager =
        reactContext.getSystemService(BluetoothManager::class.java)

    private val bluetoothAdapter: BluetoothAdapter?
        get() = bluetoothManager.adapter

    private var gattServer: BluetoothGattServer? = null
    private var advertiser: BluetoothLeAdvertiser? = null

    override fun getName(): String = MODULE_NAME

    private fun hasBluetoothPermissions(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        return true
    }

    val advertiseGranted =
        reactContext.checkSelfPermission(
            Manifest.permission.BLUETOOTH_ADVERTISE
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED

    val connectGranted =
        reactContext.checkSelfPermission(
            Manifest.permission.BLUETOOTH_CONNECT
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED

    return advertiseGranted && connectGranted
}

    @ReactMethod
    fun startAdvertising() {

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            sendLog("BLE peripheral requires Android 5.0+")
            return
        }

        if (!hasBluetoothPermissions()) {
    sendLog(
        "BLUETOOTH_ADVERTISE or BLUETOOTH_CONNECT permission not granted"
    )
    return
}

        val adapter = bluetoothAdapter

        if (adapter == null || !adapter.isEnabled) {
            sendLog("Bluetooth is OFF")
            return
        }

        if (!adapter.isMultipleAdvertisementSupported) {
            sendLog("BLE advertising is not supported")
            return
        }

        stopAdvertisingInternal()

        gattServer = bluetoothManager.openGattServer(
            reactContext,
            gattCallback
        )

        if (gattServer == null) {
            sendLog("Failed to open GATT server")
            return
        }

        val service = BluetoothGattService(
            SERVICE_UUID,
            BluetoothGattService.SERVICE_TYPE_PRIMARY
        )

        val characteristic = BluetoothGattCharacteristic(
            CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or
                    BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )

        service.addCharacteristic(characteristic)

        val added = gattServer?.addService(service) ?: false

        if (!added) {
            sendLog("Failed to add GATT service")
            stopAdvertisingInternal()
            return
        }

        sendLog(
    "GATT server opened; waiting for service to be added"
)
    }

    private fun startBleAdvertising() {

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return
        }

        val adapter = bluetoothAdapter ?: return

        advertiser = adapter.bluetoothLeAdvertiser

        if (advertiser == null) {
            sendLog("BluetoothLeAdvertiser unavailable")
            return
        }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(
                AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY
            )
            .setTxPowerLevel(
                AdvertiseSettings.ADVERTISE_TX_POWER_HIGH
            )
            .setConnectable(true)
            .build()

        val data = AdvertiseData.Builder()
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .setIncludeDeviceName(false)
            .build()

        advertiser?.startAdvertising(
            settings,
            data,
            advertiseCallback
        )
    }

    private val advertiseCallback =
        object : AdvertiseCallback() {

            override fun onStartSuccess(
                settingsInEffect: AdvertiseSettings
            ) {
                sendLog("BLE advertising started")
            }

            override fun onStartFailure(
                errorCode: Int
            ) {
                sendLog(
                    "BLE advertising failed: $errorCode"
                )
            }
        }

    private val gattCallback =
        object : BluetoothGattServerCallback() {

            override fun onServiceAdded(
                status: Int,
                service: BluetoothGattService
            ) {
                super.onServiceAdded(status, service)

                if (
                    status == BluetoothGatt.GATT_SUCCESS &&
                    service.uuid == SERVICE_UUID
                ) {
                    sendLog("GATT service added")

                    startBleAdvertising()
                } else {
                    sendLog(
                        "GATT service failed: $status"
                    )
                }
            }

            override fun onConnectionStateChange(
                device: BluetoothDevice,
                status: Int,
                newState: Int
            ) {
                super.onConnectionStateChange(
                    device,
                    status,
                    newState
                )

                if (
                    newState ==
                    android.bluetooth.BluetoothProfile.STATE_CONNECTED
                ) {
                    sendLog(
                        "Central connected: ${device.address}"
                    )
                }

                if (
                    newState ==
                    android.bluetooth.BluetoothProfile.STATE_DISCONNECTED
                ) {
                    sendLog(
                        "Central disconnected: ${device.address}"
                    )
                }
            }

            override fun onCharacteristicWriteRequest(
                device: BluetoothDevice,
                requestId: Int,
                characteristic: BluetoothGattCharacteristic,
                preparedWrite: Boolean,
                responseNeeded: Boolean,
                offset: Int,
                value: ByteArray
            ) {
                super.onCharacteristicWriteRequest(
                    device,
                    requestId,
                    characteristic,
                    preparedWrite,
                    responseNeeded,
                    offset,
                    value
                )

                if (characteristic.uuid != CHAR_UUID) {
                    return
                }

                if (responseNeeded) {
                    gattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_SUCCESS,
                        0,
                        null
                    )
                }

                val params = Arguments.createMap()

                params.putString(
                    "deviceId",
                    device.address
                )

                params.putString(
                    "data",
                    android.util.Base64.encodeToString(
                        value,
                        android.util.Base64.NO_WRAP
                    )
                )

                reactContext
                    .getJSModule(
                        DeviceEventManagerModule
                            .RCTDeviceEventEmitter::class.java
                    )
                    .emit(
                        MESSAGE_EVENT,
                        params
                    )

                sendLog(
                    "Received BLE message from ${device.address}"
                )
            }
        }

    @ReactMethod
    fun stopAdvertising() {
        stopAdvertisingInternal()
    }

    private fun stopAdvertisingInternal() {

        try {
            advertiser?.stopAdvertising(
                advertiseCallback
            )
        } catch (_: Exception) {
        }

        advertiser = null

        try {
            gattServer?.close()
        } catch (_: Exception) {
        }

        gattServer = null
    }

    private fun sendLog(message: String) {
        android.util.Log.d(
            "OfflineMeshBLE",
            message
        )
    }

    override fun invalidate() {
        stopAdvertisingInternal()
        super.invalidate()
    }
}