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

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

import java.io.ByteArrayOutputStream
import java.util.UUID

class BlePeripheralModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "BlePeripheral"
        const val MESSAGE_EVENT = "OfflineMeshMessage"

        private val SERVICE_UUID =
            UUID.fromString(
                "12345678-1234-1234-1234-123456789abc"
            )

        private val CHAR_UUID =
            UUID.fromString(
                "87654321-4321-4321-4321-cba987654321"
            )
    }

    private val bluetoothManager =
        reactContext.getSystemService(
            BluetoothManager::class.java
        )

    private val bluetoothAdapter: BluetoothAdapter?
        get() = bluetoothManager.adapter

    private var gattServer: BluetoothGattServer? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private val preparedWriteBuffers =
        mutableMapOf<String, ByteArrayOutputStream>()

    // Application-level framing for normal GATT writes.
    // Keeps each alert write below the negotiated ATT payload size.
    private val chunkAssemblies =
        mutableMapOf<String, ChunkAssembly>()

    private data class ChunkAssembly(
        val totalChunks: Int,
        val chunks: MutableMap<Int, ByteArray> = mutableMapOf()
    )

    private val frameMagic0: Byte = 0x4F
    private val frameMagic1: Byte = 0x4D
    private val frameHeaderSize = 8

    override fun getName(): String = MODULE_NAME

    // -------------------------------------------------------------------------
    // NativeEventEmitter support
    // -------------------------------------------------------------------------

    @ReactMethod
    fun addListener(eventName: String) {
        // Required by React Native NativeEventEmitter.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required by React Native NativeEventEmitter.
    }

    // -------------------------------------------------------------------------
    // Permissions
    // -------------------------------------------------------------------------

    private fun hasBluetoothPermissions(): Boolean {

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true
        }

        val advertiseGranted =
            reactContext.checkSelfPermission(
                Manifest.permission.BLUETOOTH_ADVERTISE
            ) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED

        val connectGranted =
            reactContext.checkSelfPermission(
                Manifest.permission.BLUETOOTH_CONNECT
            ) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED

        return advertiseGranted && connectGranted
    }

    // -------------------------------------------------------------------------
    // Start BLE peripheral
    // -------------------------------------------------------------------------

    @ReactMethod
    fun startAdvertising() {

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            sendLog(
                "BLE peripheral requires Android 5.0+"
            )
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
            sendLog(
                "BLE advertising is not supported"
            )
            return
        }

        // Stop any previous GATT server/advertiser.
        stopAdvertisingInternal()

        gattServer =
            bluetoothManager.openGattServer(
                reactContext,
                gattCallback
            )

        if (gattServer == null) {
            sendLog(
                "Failed to open GATT server"
            )
            return
        }

        val service =
            BluetoothGattService(
                SERVICE_UUID,
                BluetoothGattService.SERVICE_TYPE_PRIMARY
            )

        /*
         * The JS side uses:
         *
         * writeCharacteristicWithResponseForService()
         *
         * Therefore this characteristic supports WRITE.
         *
         * WRITE_NO_RESPONSE is also included for compatibility with
         * Android BLE implementations.
         */
        val characteristic =
            BluetoothGattCharacteristic(
                CHAR_UUID,

                BluetoothGattCharacteristic.PROPERTY_WRITE or
                        BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,

                BluetoothGattCharacteristic.PERMISSION_WRITE
            )

        service.addCharacteristic(characteristic)

        val added =
            gattServer?.addService(service)
                ?: false

        if (!added) {
            sendLog(
                "Failed to add GATT service"
            )

            stopAdvertisingInternal()
            return
        }

        sendLog(
            "GATT server opened; waiting for service to be added"
        )
    }

    // -------------------------------------------------------------------------
    // BLE advertising
    // -------------------------------------------------------------------------

    private fun startBleAdvertising() {

        if (Build.VERSION.SDK_INT <
            Build.VERSION_CODES.LOLLIPOP
        ) {
            return
        }

        val adapter =
            bluetoothAdapter ?: return

        advertiser =
            adapter.bluetoothLeAdvertiser

        if (advertiser == null) {
            sendLog(
                "BluetoothLeAdvertiser unavailable"
            )
            return
        }

        val settings =
            AdvertiseSettings.Builder()
                .setAdvertiseMode(
                    AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY
                )
                .setTxPowerLevel(
                    AdvertiseSettings.ADVERTISE_TX_POWER_HIGH
                )
                .setConnectable(true)
                .build()

        val data =
            AdvertiseData.Builder()
                .addServiceUuid(
                    ParcelUuid(SERVICE_UUID)
                )
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
                sendLog(
                    "BLE advertising started"
                )
            }

            override fun onStartFailure(
                errorCode: Int
            ) {
                sendLog(
                    "BLE advertising failed: $errorCode"
                )
            }
        }

    // -------------------------------------------------------------------------
    // GATT server callbacks
    // -------------------------------------------------------------------------

    private val gattCallback =
        object : BluetoothGattServerCallback() {

            override fun onServiceAdded(
                status: Int,
                service: BluetoothGattService
            ) {
                super.onServiceAdded(
                    status,
                    service
                )

                if (
                    status == BluetoothGatt.GATT_SUCCESS &&
                    service.uuid == SERVICE_UUID
                ) {

                    sendLog(
                        "GATT service added"
                    )

                    startBleAdvertising()

                } else {

                    sendLog(
                        "GATT service failed: $status"
                    )
                }
            }

            // -------------------------------------------------------------
            // Connection state
            // -------------------------------------------------------------

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

                } else if (
                    newState ==
                    android.bluetooth.BluetoothProfile.STATE_DISCONNECTED
                ) {

                    preparedWriteBuffers.remove(device.address)
                    chunkAssemblies.keys
                        .filter { it.startsWith("${device.address}:") }
                        .toList()
                        .forEach { chunkAssemblies.remove(it) }
                    sendLog(
                        "Central disconnected: ${device.address}"
                    )
                }

                sendLog(
                    "GATT connection status=$status state=$newState device=${device.address}"
                )
            }

            // -------------------------------------------------------------
            // Characteristic write
            // -------------------------------------------------------------

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

                sendLog(
                    "Write request from ${device.address}" +
                            " requestId=$requestId" +
                            " offset=$offset" +
                            " bytes=${value.size}" +
                            " responseNeeded=$responseNeeded" +
                            " preparedWrite=$preparedWrite"
                )

                if (characteristic.uuid != CHAR_UUID) {
                    if (responseNeeded) {
                        gattServer?.sendResponse(
                            device,
                            requestId,
                            BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED,
                            offset,
                            null
                        )
                    }
                    return
                }

                // Compatibility path for Android reliable/prepared writes.
                if (preparedWrite) {
                    val key = device.address
                    val buffer = preparedWriteBuffers.getOrPut(key) {
                        ByteArrayOutputStream()
                    }

                    if (offset != buffer.size()) {
                        sendLog(
                            "Prepared write invalid offset=$offset expected=${buffer.size()} " +
                                    "device=${device.address}"
                        )
                        if (responseNeeded) {
                            gattServer?.sendResponse(
                                device,
                                requestId,
                                BluetoothGatt.GATT_INVALID_OFFSET,
                                offset,
                                null
                            )
                        }
                        return
                    }

                    buffer.write(value)

                    if (responseNeeded) {
                        val sent = gattServer?.sendResponse(
                            device,
                            requestId,
                            BluetoothGatt.GATT_SUCCESS,
                            offset,
                            null
                        ) ?: false
                        sendLog(
                            "Prepared chunk acknowledged=$sent requestId=$requestId " +
                                    "totalBytes=${buffer.size()}"
                        )
                    }
                    return
                }

                if (offset != 0) {
                    if (responseNeeded) {
                        gattServer?.sendResponse(
                            device,
                            requestId,
                            BluetoothGatt.GATT_INVALID_OFFSET,
                            offset,
                            null
                        )
                    }
                    return
                }

                // Normal write: ACK immediately, then process the frame.
                if (responseNeeded) {
                    val sent = gattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_SUCCESS,
                        0,
                        null
                    ) ?: false
                    sendLog(
                        "GATT response sent=$sent requestId=$requestId device=${device.address}"
                    )
                }

                if (value.size >= frameHeaderSize &&
                    value[0] == frameMagic0 &&
                    value[1] == frameMagic1
                ) {
                    handleChunkFrame(device.address, value)
                } else {
                    emitReceivedMessage(device.address, value)
                }
            }

            private fun handleChunkFrame(
                deviceId: String,
                frame: ByteArray
            ) {
                if (frame.size < frameHeaderSize) return

                val messageId =
                    ((frame[2].toInt() and 0xFF) shl 24) or
                    ((frame[3].toInt() and 0xFF) shl 16) or
                    ((frame[4].toInt() and 0xFF) shl 8) or
                    (frame[5].toInt() and 0xFF)

                val totalChunks = frame[6].toInt() and 0xFF
                val chunkIndex = frame[7].toInt() and 0xFF

                if (totalChunks <= 0 || chunkIndex >= totalChunks) {
                    sendLog(
                        "Invalid mesh frame from $deviceId id=$messageId " +
                                "index=$chunkIndex total=$totalChunks"
                    )
                    return
                }

                val key = "$deviceId:$messageId"
                val assembly = chunkAssemblies.getOrPut(key) {
                    ChunkAssembly(totalChunks)
                }

                if (assembly.totalChunks != totalChunks) {
                    chunkAssemblies.remove(key)
                    sendLog("Mesh frame total mismatch for $key")
                    return
                }

                if (!assembly.chunks.containsKey(chunkIndex)) {
                    assembly.chunks[chunkIndex] =
                        frame.copyOfRange(frameHeaderSize, frame.size)
                }

                sendLog(
                    "Mesh chunk received from $deviceId id=$messageId " +
                            "${assembly.chunks.size}/$totalChunks"
                )

                if (assembly.chunks.size != totalChunks) return

                val complete = ByteArrayOutputStream()
                for (index in 0 until totalChunks) {
                    val chunk = assembly.chunks[index] ?: return
                    complete.write(chunk)
                }

                chunkAssemblies.remove(key)
                val completeData = complete.toByteArray()

                sendLog(
                    "Mesh message reassembled: ${completeData.size} bytes from " +
                            "$deviceId id=$messageId"
                )

                emitReceivedMessage(deviceId, completeData)
            }

            override fun onExecuteWrite(
                device: BluetoothDevice,
                requestId: Int,
                execute: Boolean
            ) {
                super.onExecuteWrite(device, requestId, execute)

                val buffer = preparedWriteBuffers.remove(device.address)

                if (!execute) {
                    sendLog("Prepared write cancelled: ${device.address}")
                    gattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_SUCCESS,
                        0,
                        null
                    )
                    return
                }

                if (buffer == null) {
                    sendLog(
                        "Prepared write execute requested with no buffer: ${device.address}"
                    )
                    gattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_FAILURE,
                        0,
                        null
                    )
                    return
                }

                val completeData = buffer.toByteArray()
                val sent = gattServer?.sendResponse(
                    device,
                    requestId,
                    BluetoothGatt.GATT_SUCCESS,
                    0,
                    null
                ) ?: false

                sendLog(
                    "Executing prepared write: ${completeData.size} bytes " +
                            "responseSent=$sent device=${device.address}"
                )

                emitReceivedMessage(device.address, completeData)
            }

            private fun emitReceivedMessage(
                deviceId: String,
                value: ByteArray
            ) {
                val base64Data = android.util.Base64.encodeToString(
                    value,
                    android.util.Base64.NO_WRAP
                )

                val params = Arguments.createMap()
                params.putString("deviceId", deviceId)
                params.putString("data", base64Data)

                try {
                    reactContext
                        .getJSModule(
                            DeviceEventManagerModule.RCTDeviceEventEmitter::class.java
                        )
                        .emit(MESSAGE_EVENT, params)

                    sendLog(
                        "OfflineMeshMessage emitted: ${value.size} bytes from $deviceId"
                    )
                } catch (error: Exception) {
                    sendLog(
                        "Failed to emit message to JS: ${error.message}"
                    )
                }
            }
        }

    // Stop BLE peripheral
    // -------------------------------------------------------------------------

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

        preparedWriteBuffers.clear()
        chunkAssemblies.clear()
        gattServer = null
    }

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    private fun sendLog(
        message: String
    ) {

        android.util.Log.d(
            "OfflineMeshBLE",
            message
        )
    }

    // -------------------------------------------------------------------------
    // React Native cleanup
    // -------------------------------------------------------------------------

    override fun invalidate() {

        stopAdvertisingInternal()

        super.invalidate()
    }
}
