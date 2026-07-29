
#ifndef _MV_CAMERA_CTRL_H_
#define _MV_CAMERA_CTRL_H_

#include "MvErrorDefine.h"
#include "CameraParams.h"
#include "MvObsoleteInterfaces.h"



#ifndef MV_CAMCTRL_API

#if (defined (_WIN32) || defined(WIN64))
#if defined(MV_CAMCTRL_EXPORTS)
#define MV_CAMCTRL_API __declspec(dllexport)
#else
#define MV_CAMCTRL_API __declspec(dllimport)
#endif
#else
#ifndef __stdcall
#define __stdcall
#endif

#ifndef MV_CAMCTRL_API
#define  MV_CAMCTRL_API
#endif
#endif

#endif

#ifdef MV_CAMCTRL_API

#if (defined (_WIN32) || defined(WIN64))
	#if defined(MV_CAMCTRL_EXPORTS)
		#define MV_CAMCTRL_API __declspec(dllexport)
	#else
		#define MV_CAMCTRL_API __declspec(dllimport)
	#endif
	#else
		#ifndef __stdcall
			#define __stdcall
		#endif

		#if defined(MV_CAMCTRL_EXPORTS)
			#define  MV_CAMCTRL_API __attribute__((visibility("default")))
		#else
			#define  MV_CAMCTRL_API
		#endif
	#endif

#endif

#ifndef IN
    #define IN
#endif

#ifndef OUT
    #define OUT
#endif

#ifdef __cplusplus
extern "C" {
#endif 


/****************************** ch: 摘要 | en: Instructions**********************************************/

/** 
*   @~english
*     This header file mainly includes 13 sections:
*     0.Callback function definition
*     1.SDK initialization
*     2.Camera configuration (enumeration/open/close) and streaming API
*     3.Frame grabber configuration (enumeration/open/close)
*     4.Universal property configuration API & register read/write API for cameras/frame grabbers
*     5.Firmware upgrade for cameras/frame grabbers
*     6.Exception callback registration and event API for cameras and frame grabbers
*     7.API exclusively for GigE devices
*     8.API exclusively for CameraLink devices
*     9.API exclusively for USB3 Vision (U3V) devices
*     10.GenTL-related API
*     11.Image saving and format conversion API
*     12.API for devices supporting serial communication
**/


/*******************Part0 ch: 回调函数定义 | en: Callback function definition*******************/
typedef void(__stdcall *MvImageCallbackEx)(unsigned char * pData, MV_FRAME_OUT_INFO_EX* pFrameInfo, void* pUser);

typedef void(__stdcall *MvImageCallbackEx2)(MV_FRAME_OUT* pstFrame, void *pUser, bool bAutoFree);

typedef void(__stdcall *MvEventCallback)(MV_EVENT_OUT_INFO * pEventInfo, void* pUser);

typedef void(__stdcall *MvStreamExceptionCallback)(MV_CC_STREAM_EXCEPTION_INFO* pstStreamExceptionInfo, void* pUser);

typedef void(__stdcall *MvExceptionCallback)(unsigned int nMsgType, void *pUser);


/**************************Part1 ch: SDK 初始化 | en: SDK Initialization ******************************************/
MV_CAMCTRL_API int __stdcall MV_CC_Initialize();

MV_CAMCTRL_API int __stdcall MV_CC_Finalize();

MV_CAMCTRL_API unsigned int __stdcall MV_CC_GetSDKVersion();




/**************************Part2 ch: 相机的控制和取流  | en: Camera control and streaming******************************************/


MV_CAMCTRL_API int __stdcall MV_CC_EnumDevices(IN unsigned int nTLayerType, IN OUT MV_CC_DEVICE_INFO_LIST* pstDevList);

MV_CAMCTRL_API int __stdcall MV_CC_EnumDevicesEx(IN unsigned int nTLayerType, IN OUT MV_CC_DEVICE_INFO_LIST* pstDevList, IN const char* strManufacturerName);


MV_CAMCTRL_API int __stdcall MV_CC_EnumDevicesEx2(IN unsigned int nTLayerType, IN OUT MV_CC_DEVICE_INFO_LIST* pstDevList, IN const char* strManufacturerName, IN MV_SORT_METHOD enSortMethod);

MV_CAMCTRL_API bool __stdcall MV_CC_IsDeviceAccessible(IN MV_CC_DEVICE_INFO* pstDevInfo, IN unsigned int nAccessMode);


MV_CAMCTRL_API int __stdcall MV_CC_CreateHandle(IN OUT void ** handle, IN const MV_CC_DEVICE_INFO* pstDevInfo);

MV_CAMCTRL_API int __stdcall MV_CC_DestroyHandle(IN void * handle);

#ifndef __cplusplus
MV_CAMCTRL_API int __stdcall MV_CC_OpenDevice(IN void* handle, IN unsigned int nAccessMode, IN unsigned short nSwitchoverKey);
#else
MV_CAMCTRL_API int __stdcall MV_CC_OpenDevice(IN void* handle, IN unsigned int nAccessMode = MV_ACCESS_Exclusive, IN unsigned short nSwitchoverKey = 0);
#endif

MV_CAMCTRL_API int __stdcall MV_CC_CloseDevice(IN void* handle);

MV_CAMCTRL_API bool __stdcall MV_CC_IsDeviceConnected(IN void* handle);

MV_CAMCTRL_API int __stdcall MV_CC_RegisterImageCallBackEx(IN void* handle, IN MvImageCallbackEx cbOutput, IN void* pUser);

MV_CAMCTRL_API int __stdcall MV_CC_RegisterImageCallBackEx2(IN void* handle, IN MvImageCallbackEx2 cbOutput, IN void* pUser, IN bool bAutoFree);

MV_CAMCTRL_API int __stdcall MV_CC_RegisterStreamExceptionCallBack(IN void* handle, IN MvStreamExceptionCallback cbStreamException, IN void* pUser);

MV_CAMCTRL_API int __stdcall MV_CC_StartGrabbing(IN void* handle);

MV_CAMCTRL_API int __stdcall MV_CC_StopGrabbing(IN void* handle);

MV_CAMCTRL_API int __stdcall MV_CC_GetImageBuffer(IN void* handle, IN OUT MV_FRAME_OUT* pstFrame, IN unsigned int nMsec);

MV_CAMCTRL_API int __stdcall MV_CC_FreeImageBuffer(IN void* handle, IN MV_FRAME_OUT* pstFrame);

MV_CAMCTRL_API int __stdcall MV_CC_GetOneFrameTimeout(IN void* handle, IN OUT unsigned char* pData , IN unsigned int nDataSize, IN OUT MV_FRAME_OUT_INFO_EX* pstFrameInfo, IN unsigned int nMsec);

MV_CAMCTRL_API int __stdcall MV_CC_ClearImageBuffer(IN void* handle);

MV_CAMCTRL_API int __stdcall MV_CC_GetValidImageNum(IN void* handle, IN OUT unsigned int *pnValidImageNum);

MV_CAMCTRL_API int __stdcall MV_CC_DisplayOneFrameEx(IN void* handle, IN void* hWnd, IN MV_DISPLAY_FRAME_INFO_EX* pstDisplayInfo);

MV_CAMCTRL_API int __stdcall MV_CC_DisplayOneFrameEx2(IN void* handle, IN void* hWnd, IN MV_CC_IMAGE* pstImage, unsigned int enRenderMode);

MV_CAMCTRL_API int __stdcall MV_CC_SetImageNodeNum(IN void* handle, IN unsigned int nNum);

MV_CAMCTRL_API int __stdcall MV_CC_SetGrabStrategy(IN void* handle, IN MV_GRAB_STRATEGY enGrabStrategy);

MV_CAMCTRL_API int __stdcall MV_CC_SetOutputQueueSize(IN void* handle, IN unsigned int nOutputQueueSize);

MV_CAMCTRL_API int __stdcall MV_CC_GetDeviceInfo(IN void * handle, IN OUT MV_CC_DEVICE_INFO* pstDevInfo);

MV_CAMCTRL_API int __stdcall MV_CC_GetAllMatchInfo(IN void* handle, IN OUT MV_ALL_MATCH_INFO* pstInfo);




/**************************Part3 ch: 采集卡的配置  | en: Frame grabber control ******************************************/

MV_CAMCTRL_API int __stdcall MV_CC_EnumInterfaces(IN unsigned int nTLayerType, IN OUT MV_INTERFACE_INFO_LIST* pInterfaceInfoList);

MV_CAMCTRL_API int __stdcall MV_CC_CreateInterface(IN OUT void ** handle, IN MV_INTERFACE_INFO* pInterfaceInfo);

MV_CAMCTRL_API int __stdcall MV_CC_CreateInterfaceByID(IN OUT void ** handle, IN const char* pInterfaceID);

MV_CAMCTRL_API int __stdcall MV_CC_OpenInterface(IN void* handle, IN char* pReserved);

MV_CAMCTRL_API int __stdcall MV_CC_CloseInterface(IN void* handle);

MV_CAMCTRL_API int __stdcall MV_CC_DestroyInterface(IN void* handle);

MV_CAMCTRL_API int __stdcall MV_CC_EnumDevicesByInterface(IN void* handle, OUT MV_CC_DEVICE_INFO_LIST* pstDevList);



/*******************Part4 ch: 相机/采集卡属性万能配置接口 | en: Universal configuration API for camera/frame grabber properties*******************/

MV_CAMCTRL_API int __stdcall MV_CC_GetIntValueEx(IN void* handle,IN const char* strKey,IN OUT MVCC_INTVALUE_EX *pstIntValue);

MV_CAMCTRL_API int __stdcall MV_CC_SetIntValueEx(IN void* handle,IN const char* strKey,IN int64_t nValue);

MV_CAMCTRL_API int __stdcall MV_CC_GetEnumValue(IN void* handle,IN const char* strKey,IN OUT MVCC_ENUMVALUE *pstEnumValue);

MV_CAMCTRL_API int __stdcall MV_CC_GetEnumValueEx(IN void* handle, IN const char* strKey, IN OUT MVCC_ENUMVALUE_EX *pstEnumValue);

MV_CAMCTRL_API int __stdcall MV_CC_SetEnumValue(IN void* handle,IN const char* strKey,IN unsigned int nValue);

MV_CAMCTRL_API int __stdcall MV_CC_GetEnumEntrySymbolic(IN void* handle,IN const char* strKey,IN OUT MVCC_ENUMENTRY* pstEnumEntry);

MV_CAMCTRL_API int __stdcall MV_CC_SetEnumValueByString(IN void* handle,IN const char* strKey,IN const char* strValue);

MV_CAMCTRL_API int __stdcall MV_CC_GetFloatValue(IN void* handle,IN const char* strKey,IN OUT MVCC_FLOATVALUE *pstFloatValue);

MV_CAMCTRL_API int __stdcall MV_CC_SetFloatValue(IN void* handle,IN const char* strKey,IN float fValue);
    
MV_CAMCTRL_API int __stdcall MV_CC_GetBoolValue(IN void* handle,IN const char* strKey,IN OUT bool *pbValue);

MV_CAMCTRL_API int __stdcall MV_CC_SetBoolValue(IN void* handle,IN const char* strKey,IN bool bValue);

MV_CAMCTRL_API int __stdcall MV_CC_GetStringValue(IN void* handle,IN const char* strKey,IN OUT MVCC_STRINGVALUE *pstStringValue);

MV_CAMCTRL_API int __stdcall MV_CC_SetStringValue(IN void* handle,IN const char* strKey,IN const char* strValue);

MV_CAMCTRL_API int __stdcall MV_CC_SetCommandValue(IN void* handle,IN const char* strKey);



MV_CAMCTRL_API int __stdcall MV_CC_ReadMemory(IN void* handle , IN OUT void *pBuffer, IN int64_t nAddress, IN int64_t nLength);

MV_CAMCTRL_API int __stdcall MV_CC_WriteMemory(IN void* handle, IN const void *pBuffer, IN int64_t nAddress, IN int64_t nLength);



MV_CAMCTRL_API int __stdcall MV_CC_InvalidateNodes(IN void* handle);

MV_CAMCTRL_API int __stdcall MV_XML_GetGenICamXML(IN void* handle, IN OUT unsigned char* pData, IN unsigned int nDataSize, IN OUT unsigned int* pnDataLen);

MV_CAMCTRL_API int __stdcall MV_XML_GetNodeAccessMode(IN void* handle, IN const char * strName, IN OUT enum MV_XML_AccessMode *penAccessMode);

MV_CAMCTRL_API int __stdcall MV_XML_GetNodeInterfaceType(IN void* handle, IN const char * strName, IN OUT enum MV_XML_InterfaceType *penInterfaceType);

MV_CAMCTRL_API int __stdcall MV_CC_FeatureSave(IN void* handle, IN const char* strFileName);

MV_CAMCTRL_API int __stdcall MV_CC_FeatureLoad(IN void* handle, IN const char* strFileName);

MV_CAMCTRL_API int __stdcall MV_CC_FeatureLoadEx(IN void* handle, IN const char* strFileName, IN OUT MVCC_NODE_ERROR_LIST* pstNodeErrorList);

MV_CAMCTRL_API int __stdcall MV_CC_FileAccessRead(IN void* handle, IN MV_CC_FILE_ACCESS * pstFileAccess);


MV_CAMCTRL_API int __stdcall MV_CC_FileAccessReadEx(IN void* handle, IN OUT MV_CC_FILE_ACCESS_EX * pstFileAccessEx);

MV_CAMCTRL_API int __stdcall MV_CC_FileAccessWrite(IN void* handle, IN MV_CC_FILE_ACCESS * pstFileAccess);


MV_CAMCTRL_API int __stdcall MV_CC_FileAccessWriteEx(IN void* handle, IN OUT MV_CC_FILE_ACCESS_EX * pstFileAccessEx);


MV_CAMCTRL_API int __stdcall MV_CC_GetFileAccessProgress(IN void* handle, IN OUT MV_CC_FILE_ACCESS_PROGRESS * pstFileAccessProgress);


/*******************Part5 ch: 相机和采集卡 升级 | en:  Camera /Frame grabber  upgrade *******************/

MV_CAMCTRL_API int __stdcall MV_CC_LocalUpgrade(IN void* handle, IN const void* strFilePathName);

MV_CAMCTRL_API int __stdcall MV_CC_GetUpgradeProcess(IN void* handle, IN OUT unsigned int* pnProcess);


/*******************Part6  ch: 相机和采集卡 注册异常回调和事件接口 | en:  Exception callback registration and event API for cameras and frame grabbers*******************/

MV_CAMCTRL_API int __stdcall MV_CC_RegisterExceptionCallBack(IN void* handle, IN MvExceptionCallback cbException, IN void* pUser);

MV_CAMCTRL_API int __stdcall MV_CC_RegisterAllEventCallBack(IN void* handle, IN MvEventCallback cbEvent, IN void* pUser);

MV_CAMCTRL_API int __stdcall MV_CC_RegisterEventCallBackEx(IN void* handle, IN const char* strEventName, IN MvEventCallback cbEvent, IN void* pUser);

MV_CAMCTRL_API int __stdcall MV_CC_EventNotificationOn(IN void* handle, IN const char* strEventName);

MV_CAMCTRL_API int __stdcall MV_CC_EventNotificationOff(IN void* handle, IN const char* strEventName);



/*******************Part7 ch: 仅GigE设备支持的接口 | en: API exclusively for GigE devices*******************/

MV_CAMCTRL_API int __stdcall MV_GIGE_SetEnumDevTimeout(IN unsigned int nMilTimeout);

MV_CAMCTRL_API int __stdcall MV_GIGE_ForceIpEx(IN void* handle, IN unsigned int nIP, IN unsigned int nSubNetMask, IN unsigned int nDefaultGateWay);

MV_CAMCTRL_API int __stdcall MV_GIGE_SetIpConfig(IN void* handle, IN unsigned int nType);

MV_CAMCTRL_API int __stdcall MV_GIGE_SetNetTransMode(IN void* handle, IN unsigned int nType);

MV_CAMCTRL_API int __stdcall MV_GIGE_GetNetTransInfo(IN void* handle, IN OUT MV_NETTRANS_INFO* pstInfo);

MV_CAMCTRL_API int __stdcall MV_GIGE_SetDiscoveryMode(IN unsigned int nMode);

MV_CAMCTRL_API int __stdcall MV_GIGE_SetGvspTimeout(IN void* handle, IN unsigned int nMillisec);

MV_CAMCTRL_API int __stdcall MV_GIGE_GetGvspTimeout(IN void* handle, IN OUT unsigned int* pnMillisec);

MV_CAMCTRL_API int __stdcall MV_GIGE_SetGvcpTimeout(IN void* handle, IN unsigned int nMillisec);

MV_CAMCTRL_API int __stdcall MV_GIGE_GetGvcpTimeout(IN void* handle, IN OUT unsigned int* pnMillisec);

MV_CAMCTRL_API int __stdcall MV_GIGE_SetRetryGvcpTimes(IN void* handle, IN unsigned int nRetryGvcpTimes);

MV_CAMCTRL_API int __stdcall MV_GIGE_GetRetryGvcpTimes(IN void* handle, IN OUT unsigned int* pnRetryGvcpTimes);

MV_CAMCTRL_API int __stdcall MV_CC_GetOptimalPacketSize(IN void* handle);

#ifndef __cplusplus
MV_CAMCTRL_API int __stdcall MV_GIGE_SetResend(IN void* handle, IN unsigned int bEnable, IN unsigned int nMaxResendPercent, IN unsigned int nResendTimeout);
#else
MV_CAMCTRL_API int __stdcall MV_GIGE_SetResend(IN void* handle, IN unsigned int bEnable, IN unsigned int nMaxResendPercent = 100, IN unsigned int nResendTimeout = 50);
#endif

MV_CAMCTRL_API int __stdcall  MV_GIGE_SetResendMaxRetryTimes(IN void* handle, IN unsigned int nRetryTimes);

MV_CAMCTRL_API int __stdcall  MV_GIGE_GetResendMaxRetryTimes(IN void* handle, IN OUT unsigned int* pnRetryTimes);

MV_CAMCTRL_API int __stdcall  MV_GIGE_SetResendTimeInterval(IN void* handle, IN unsigned int nMillisec);

MV_CAMCTRL_API int __stdcall  MV_GIGE_GetResendTimeInterval(IN void* handle, IN OUT unsigned int* pnMillisec);

MV_CAMCTRL_API int __stdcall MV_GIGE_SetTransmissionType(IN void* handle, IN MV_TRANSMISSION_TYPE * pstTransmissionType);

MV_CAMCTRL_API int __stdcall MV_GIGE_IssueActionCommand(IN MV_ACTION_CMD_INFO* pstActionCmdInfo, IN OUT MV_ACTION_CMD_RESULT_LIST* pstActionCmdResults);

MV_CAMCTRL_API int __stdcall MV_GIGE_GetMulticastStatus(IN MV_CC_DEVICE_INFO* pstDevInfo, IN OUT bool* pbStatus);


/*******************Part8 ch: 仅CameraLink 设备支持的接口 | en: API exclusively for CameraLink devices*******************/
MV_CAMCTRL_API int __stdcall MV_CAML_GetSerialPortList(IN OUT MV_CAML_SERIAL_PORT_LIST* pstSerialPortList);

MV_CAMCTRL_API int __stdcall MV_CAML_SetEnumSerialPorts(IN MV_CAML_SERIAL_PORT_LIST* pstSerialPortList);

/***********************************************************************************************************//**
 *  @~english
 *  @brief  Sets baud rate for the device. 
 *  @param  handle                      [IN]            It refers to the device handle. 
 *  @param  nBaudrate                   [IN]            It refers to baud rate to set. Refer to the 'CameraParams.h' for parameter definitions. for example, #define MV_CAML_BAUDRATE_9600  0x00000001
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks You can call this API when the device is not connected. If the device is accessed via GenTL protocol, call this API after the device is connected.            
             High baud rate may cause communication exception due to factors such as hardware specification, system configuration, and external interference. 
             It is recommended to configure a baud rate of less than 115200
************************************************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CAML_SetDeviceBaudrate(IN void* handle, IN unsigned int nBaudrate);

/********************************************************************//**
 *  @~english
 *  @brief  Gets baud rate for devices. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  pnCurrentBaudrate           [IN][OUT]       It refers to the pointer to baud rate information. See the 'CameraParams.h' for parameter definitions, for example, #define MV_CAML_BAUDRATE_9600  0x00000001
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks You can call this API when the device is not connected. 
************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CAML_GetDeviceBaudrate(IN void* handle,IN OUT unsigned int* pnCurrentBaudrate);

/********************************************************************//**
 *  @~english
 *  @brief  Gets the supported baud rate of the connection between the device and host. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  pnBaudrateAblity            [IN][OUT]       It refers to the pointer to the supported baud rate information. See 'CameraParams.h' for the definitions of single value of the OR operation results of all supported baud rate.
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks You can call this API when the device is not connected. 
************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CAML_GetSupportBaudrates(IN void* handle,IN OUT unsigned int* pnBaudrateAblity);

/********************************************************************//**
 *  @~english
 *  @brief  Sets the waiting duration for serial port operation. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  nMillisec                   [IN]            It refers to waiting time of serial port operation, unit: millisecond. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CAML_SetGenCPTimeOut(IN void* handle, IN unsigned int nMillisec);


/*******************Part9 ch: 仅U3V设备支持的接口 | en: API exclusively for USB3 Vision (U3V) devices*******************/

/********************************************************************//**
 *  @~english
 *  @brief  Sets transmission packet size of USB3 vision cameras. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  nTransferSize               [IN]            It refers to the size of the transmission packet (unit: byte), and the default value is 1 MB (1,048,576 bytes).rang: >=0x400. 
                                                        Recommended maximum values: [Windows] range ≤ 0x400000; [Linux] range ≤ 0x200000.
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks Increasing the packet size can reduce the CPU usage, but for different computers and USB expansion cards, the compatibility is different. If the packet size is too large, image acquisition might fail. 
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_USB_SetTransferSize(IN void* handle, IN unsigned int nTransferSize);

/********************************************************************//**
 *  @~english
 *  @brief  Gets transmission packet size of USB3 vision cameras. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  pnTransferSize              [IN][OUT]       It refers to the pointer to the size of the transmission packet (unit: byte). 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks Call this API to get the packet size of the current USB3 vision device (1 MB by default). 
************************************************************************/
MV_CAMCTRL_API int __stdcall MV_USB_GetTransferSize(IN void* handle, IN OUT unsigned int* pnTransferSize);

/********************************************************************//**
 *  @~english
 *  @brief  Sets the number of transmission channels of USB3 vision cameras. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  nTransferWays               [IN]            It refers to the number of transmission channels. It should be between 1 to 10. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure. 
 *  @remarks This parameter can be adjusted based on computer performance, device image frame rate, device image size, and device memory usage. But compatibility differs due to different PC and USB expansion cards. 
************************************************************************/
MV_CAMCTRL_API int __stdcall MV_USB_SetTransferWays(IN void* handle, IN unsigned int nTransferWays);

/********************************************************************//**
 *  @~english
 *  @brief  Gets the number of transmission channels of USB3 vision cameras. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  pnTransferWays              [IN][OUT]       It refers to the pointer to the number of transmission channels. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure. 
 *  @remarks This API is used to get the current number of U3V asynchronous image acquisition nodes. 
             For USB3 vision cameras, the number of transmission channels is closely related to the packet size corresponding to the pixel format, and it can be calculated based on the max. asynchronous registration length/packet size of pixel format. 
************************************************************************/
MV_CAMCTRL_API int __stdcall MV_USB_GetTransferWays(IN void* handle, IN OUT unsigned int* pnTransferWays);

/********************************************************************//**
 *  @~english
 *  @brief  Sets the number of event buffer nodes of USB3 vision cameras. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  nEventNodeNum               [IN]            It refers to the number of event buffer nodes, range: [1, 64]. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure. 
 *  @remarks Call this API to set the number of the buffer nodes for the current USB3 vision event. The default value is 5. 
************************************************************************/
MV_CAMCTRL_API int __stdcall MV_USB_SetEventNodeNum(IN void* handle, IN unsigned int nEventNodeNum);


/********************************************************************//**
 *  @~english
 *  @brief  Sets the timeout duration for sync reading and writing of USB3 vision devices (1000 ms by default), range: [1000, INT_MAX]. 
 *  @param  handle               [IN]            It refers to the device handle.
 *  @param  nMills               [IN]            It refers to the timeout duration for sync reading and writing (1000 by default), unit: millisecond. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.  
 *  @remarks Increasing the timeout duration for sync reading and writing can help deal with the problem that some cameras' parameter configuration process is very slow (more than 1000 ms). 
************************************************************************/
MV_CAMCTRL_API int __stdcall MV_USB_SetSyncTimeOut(IN void* handle, IN unsigned int nMills);

/********************************************************************//**
 *  @~english
 *  @brief  Gets the timeout duration for sync reading and writing of USB3 vision devices. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  pnMills                     [IN][OUT]       It refers to the timeout duration, unit: millisecond.
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks Call this API to get the timeout duration for sync reading and writing of USB3 vision cameras (1000 ms by default).
************************************************************************/
MV_CAMCTRL_API int __stdcall MV_USB_GetSyncTimeOut(IN void* handle, IN OUT unsigned int* pnMills);



/*******************Part10 en: GenTL-related API*******************/

/******************************************************************************//**
 *  @~english
 *  @brief  Enumerates interfaces via GenTL. 
 *  @param  pstIFList                   [IN][OUT]       It refers to interface list. 
 *  @param  strGenTLPath                [IN]            It refers to CTI file path of GenTL. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks The memory of device list is internally allocated. When this API is called in multiple threads, the SDK will release and apply for the device list memory. 
             It is recommended to avoid multithreaded enumeration operations. 
             MvProducerU3V.cti and MvProducerGEV.cti calling are unsupported.
 *******************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_EnumInterfacesByGenTL(IN OUT MV_GENTL_IF_INFO_LIST* pstIFList, IN const char * strGenTLPath);

/********************************************************************//**
 *  @~english
 *  @brief  Unload the CTI library. 
 *  @param  pGenTLPath                [IN]            It refers to the CTI file path during the enumeration. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks Make sure that all cameras enumerated by the CTI file are closed before calling this API. Otherwise, MV_E_PRECONDITION error will be returned. 
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_UnloadGenTLLibrary(IN const char * pGenTLPath);

/*****************************************************************************************************//**
 *  @~english
 *  @brief  Enumerates devices via GenTL interface. 
 *  @param  pstIFInfo                   [IN]            It refers to interface information. 
 *  @param  pstDevList                  [IN][OUT]       It refers to the device list. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks The memory of device list is internally allocated. When this API is called in multiple threads, the SDK will release and apply for the device list memory. 
             It is recommended to avoid multithreaded enumeration operations. 
 *****************************************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_EnumDevicesByGenTL(IN MV_GENTL_IF_INFO* pstIFInfo, IN OUT MV_GENTL_DEV_INFO_LIST* pstDevList);

/********************************************************************//**
 *  @~english
 *  @brief  Creates the device handle by GenTL related device information. 
 *  @param  handle                      [IN][OUT]       It refers to interface information. 
 *  @param  pstDevInfo                  [IN]            It refers to the struct pointer to device Information. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure. 
 *  @remarks Create required resources within library and initialize internal module according to input device information. 
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_CreateHandleByGenTL(IN OUT void ** handle, IN const MV_GENTL_DEV_INFO* pstDevInfo);



/*******************Part11 ch: 图像保存、格式转换等相关接口 | en: Image saving and format conversion API*******************/

/********************************************************************//**
 *  @~english
 *  @brief  Saves images, supporting BMP and JPEG. 
 *  @param  handle                      [IN]            It refers to the device handle. 
 *  @param  pstSaveParam                [IN][OUT]       It refers to the structure of image saving parameters. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure. 
 *  @remarks Call this API to convert the collected original images to JPEG or BMP format and save them to specified memory. You can then save the converted data as image files. 
             This API requires no specific calling sequence. The conversion will be executed when there is any image data. You can call MV_CC_GetOneFrameTimeout() or MV_CC_RegisterImageCallBackEx() to set the callback function and get one image frame, then call this API to convert the format. 
             This API supports setting the nWidth/nHeight/Length parameter to UINT_MAX: MV_CC_SaveImageEx2() supports setting the max. parameter to USHRT_MAX, and JPEG format supports the max. width and height value 65500.
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_SaveImageEx3(IN void* handle, IN OUT MV_SAVE_IMAGE_PARAM_EX3* pstSaveParam);

/********************************************************************//**
 *  @~english
 *  @brief  Saves image to file (extended API 1) 
 *  @param  handle                      [IN]            It refers to the device handle. 
 *  @param  pstSaveFileParam            [IN][OUT]       It refers to the structure of image file saving parameters. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure. 
 *  @remarks It supports saving images in BMP, JPEG, PNG, and TIFF formats. 
             this API support the parameter nWidth/nHeight/Length to UINT_MAX. 
			 For images in JPEG format, the supported max. width and height values are 65500. 
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_SaveImageToFileEx(IN void* handle, IN OUT MV_SAVE_IMAGE_TO_FILE_PARAM_EX* pstSaveFileParam);

/********************************************************************//**
 *  @~english
 *  @brief  Saves image to file (extended API 2) 
 *  @param  handle                      [IN]            It refers to the device handle. 
 *  @param  pstImage                    [IN]            It refers to the image information. 
 *  @param  pSaveImageParam             [IN]            It refers to the image saving parameter. 
 *  @param  pcImagePath                 [IN]            It refers to the image saving path. On  Windows length does not exceed 260 bytes, and on Linux, it does not exceed 255 bytes.
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks It supports saving images over 4 GB in PNG and TIFF formats, and images under 4 GB in BMP, JPEG, TIFF, and PNG formats. 
			 For images in JPEG format, the supported max. width and height values are 65500. 
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_SaveImageToFileEx2(IN void* handle, IN MV_CC_IMAGE* pstImage, IN MV_CC_SAVE_IMAGE_PARAM* pSaveImageParam, IN const char* pcImagePath);

/********************************************************************//**
 *  @~english
 *  @brief  Rotates images. 
 *  @param  handle                      [IN]            It refers to the device handle. 
 *  @param  pstRotateParam              [IN][OUT]       It refers to image rotation parameters structure. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks This API only supports 90°, 180°, and 270° rotation of images in Mono 8, RGB 24, and BGR 24 formats. 
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_RotateImage(IN void* handle, IN OUT MV_CC_ROTATE_IMAGE_PARAM* pstRotateParam);

/********************************************************************//**
 *  @~english
 *  @brief  Flips images
 *  @param  handle                      [IN]            It refers to the device handle. 
 *  @param  pstFlipParam                [IN][OUT]       It refers to the structure of image flipping parameters. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks This API only support vertical and horizontal flipping of images in Mono 8, RGB 24, and BGR 24 formats. 
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_FlipImage(IN void* handle, IN OUT MV_CC_FLIP_IMAGE_PARAM* pstFlipParam);


/********************************************************************//**
 *  @~english
 *  @brief  Converts pixel format.
 *  @param  handle                      [IN]            It refers to the device handle. 
 *  @param  pstCvtParam                 [IN][OUT]       It refers to the structure of pixel format conversion parameters.
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks Call this API to convert the collected original images to images in required pixel format and save them to specified memory.  
             This API requires no specific calling sequence. The conversion will be executed when there is any image data. 
             You can call MV_CC_GetOneFrameTimeout() or MV_CC_RegisterImageCallBackEx() to set the callback function and get one image frame, then call this API to convert the format. 
             If the collected image is in compressed JPEG format, it cannot be converted via this API. 
             this API support the parameter nWidth/nHeight/Length to UINT_MAX.
             Comparing with the API MV_CC_ConvertPixelType, this API support the parameter nWidth/nHeight/Length to UINT_MAX. 

 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_ConvertPixelTypeEx(IN void* handle, IN OUT MV_CC_PIXEL_CONVERT_PARAM_EX* pstCvtParam);

/********************************************************************//**
 *  @~english
 *  @brief  Sets the interpolation method of Bayer format. 
 *  @param  handle                      [IN]            It refers to the device handle. 
 *  @param  nBayerCvtQuality            [IN]            It refers to interpolation method. 0: fast; 1: equilibrated; 2: optimal (default); 3: optimal plus. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks Call this API to set the Bayer interpolation algorithm type parameter for the APIs: MV_CC_ConvertPixelTypeEx() , MV_CC_GetImageForRGB() , and MV_CC_GetImageForBGR(). 
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_SetBayerCvtQuality(IN void* handle, IN unsigned int nBayerCvtQuality);

/********************************************************************//**
 *  @~english
 *  @brief  Enables or disables the smoothing function of interpolation algorithm. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  bFilterEnable               [IN]            Whether to enable the smoothing function of interpolation algorithm (disabled by default). 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks This API is used to enable or disable the smoothing function of Bayer interpolation, and it determines the interpolation algorithm of the APIs: MV_CC_ConvertPixelTypeEx()、MV_CC_SaveImageToFileEx and MV_CC_SaveImageEx3(). 
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_SetBayerFilterEnable(IN void* handle, IN bool bFilterEnable);

/********************************************************************//**
 *  @~english
 *  @brief  Sets the Gamma value in Bayer pattern. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  fBayerGammaValue            [IN]            It refers to the Gamma value, range: [0.1, 4.0].
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks After setting this value, it takes effect when converting Bayer images (Bayer8/10/12/16) to RGB/BGR images (RGB24/48, RGBA32/64, BGR24/48, BGRA32/64). Related API: MV_CC_ConvertPixelTypeEx, MV_CC_SaveImageEx3, MV_CC_SaveImageToFileEx.
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_SetBayerGammaValue(IN void* handle, IN float fBayerGammaValue);

/********************************************************************//**
 *  @~english
 *  @brief  Sets Gamma value of Mono 8 or Bayer 8/10/12/16 pattern. 
 *  @param  handle                           [IN]            It refers to the device handle.
 *  @param  MvGvspPixelType enSrcPixelType   [IN]            It refers to the pixel format. Supports PixelType_Gvsp_Mono8 and Bayer 8/10/12/16. 
 *  @param  fGammaValue                      [IN]            It refers to the Gamma value, range: [0.1, 4.0]. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks The Gamma value in Mono 8 pattern set via this API will be used when MV_CC_ConvertPixelType() is called to convert Mono 8 to Mono 8.
 *  @remarks The Gamma value in Bayer8/10/12/16 pattern set via this API will be used when calling MV_CC_ConvertPixelTypeEx() , MV_CC_SaveImageEx3() , or MV_CC_SaveImageToFileEx() to convert Bayer 8/10/12/16 format to RGB 24/48, RGBA 32/64, BGR 24/48 or BGRA 32/64. 
 *  @remarks This API is compatible with MV_CC_SetBayerGammaValue() , and it supports Mono 8 pixel format. 
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_SetGammaValue(IN void* handle, IN enum MvGvspPixelType enSrcPixelType, IN float fGammaValue);

/********************************************************************//**
 *  @~english
 *  @brief  Sets the Gamma value of Bayer pattern. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  pstGammaParam               [IN]            It refers to the Gamma information.
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks The Gamma value set by this API will be used when calling MV_CC_ConvertPixelTypeEx() , MV_CC_SaveImageEx3(), MV_CC_SaveImageToFileEx(), to convert Bayer 8/10/12/16 format to RGB24/48, BGR24/48, RGBA32/64, or BGRA32/64.
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_SetBayerGammaParam(IN void* handle, IN MV_CC_GAMMA_PARAM* pstGammaParam);

/********************************************************************//**
 *  @~english
 *  @brief  Enables/disables CCM and sets CCM parameters in Bayer pattern. The default quantitative scale is 1024. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  pstCCMParam                 [IN]            It refers to the CCM parameters. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure.
 *  @remarks After the API is called to enable CCM and set the CCM, the CCM parameters will take effect when MV_CC_ConvertPixelTypeEx() or MV_CC_SaveImageEx3() or MV_CC_SaveImageToFileEx() is called to convert Bayer 8/10/12/16 format to RGB 24/48, RGBA 32/64, BGR 24/48, or BGRA 32/64. 
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_SetBayerCCMParam(IN void* handle, IN MV_CC_CCM_PARAM* pstCCMParam);

/********************************************************************//**
 *  @~english
 *  @brief  Enables and disables CCM, and sets CCM parameters of Bayer pattern. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  pstCCMParam                 [IN]            It refers to the color correction parameter structure. 
 *  @return Success, return MV_OK. Failure, return error code
 *  @remarks After the API is called to enable CCM and set the CCM, the CCM parameters will take effect when MV_CC_ConvertPixelTypeEx() or MV_CC_SaveImageEx3() or MV_CC_SaveImageToFileEx() is called to convert Bayer 8/10/12/16 format to RGB 24/48, RGBA 32/64, BGR 24/48, or BGRA 32/64. 
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_SetBayerCCMParamEx(IN void* handle, IN MV_CC_CCM_PARAM_EX* pstCCMParam);

/********************************************************************//**
 *  @~english
 *  @brief  Adjusts image contrast. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  pstContrastParam            [IN][OUT]       It refers to the contrast parameter structure. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure. 
 *  @remarks 
 ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_ImageContrast(IN void* handle, IN OUT MV_CC_CONTRAST_PARAM* pstContrastParam);

/********************************************************************//**
 *  @~english
 *  @brief  Corrects purple fringing of the image. 
 *  @param  handle                      [IN]            It refers to the device handle.
 *  @param  pstPurpleFringingParam      [IN][OUT]       It refers to purple fringing correction parameter. 
 *  @return Returns MV_OK for success, and returns corresponding Error Code for failure. 
 *  @remarks This API only supports processing images in PixelType_Gvsp_RGB8_Packed and PixelType_Gvsp_BGR8_Packed formats. 
 *  ************************************************************************/
MV_CAMCTRL_API int __stdcall MV_CC_PurpleFringing(IN void* handle, IN MV_CC_PURPLE_FRINGING_PARAM* pstPurpleFringingParam);

MV_CAMCTRL_API int __stdcall MV_CC_SetISPConfig(void* handle, IN MV_CC_ISP_CONFIG_PARAM* pstParam);

MV_CAMCTRL_API int __stdcall MV_CC_ISPProcess(void* handle, IN MV_CC_IMAGE* pstInputImage, MV_CC_IMAGE* pstOutputImage);

MV_CAMCTRL_API int __stdcall MV_CC_HB_Decode(IN void* handle, IN OUT MV_CC_HB_DECODE_PARAM* pstDecodeParam);

MV_CAMCTRL_API int __stdcall MV_CC_DrawRect(IN void* handle, IN MVCC_RECT_INFO* pRectInfo);

MV_CAMCTRL_API int __stdcall MV_CC_DrawCircle(IN void* handle, IN MVCC_CIRCLE_INFO* pCircleInfo);

MV_CAMCTRL_API int __stdcall MV_CC_DrawLines(IN void* handle, IN MVCC_LINES_INFO* pLinesInfo);

MV_CAMCTRL_API int __stdcall MV_CC_StartRecord(IN void* handle, IN MV_CC_RECORD_PARAM* pstRecordParam);

MV_CAMCTRL_API int __stdcall MV_CC_InputOneFrame(IN void* handle, IN MV_CC_INPUT_FRAME_INFO * pstInputFrameInfo);

MV_CAMCTRL_API int __stdcall MV_CC_StopRecord(IN void* handle);

MV_CAMCTRL_API int __stdcall MV_CC_ReconstructImage(IN void* handle, IN OUT MV_RECONSTRUCT_IMAGE_PARAM* pstReconstructParam);



MV_CAMCTRL_API void *  __stdcall MV_CC_AllocAlignedBuffer(IN uint64_t  nBufSize, IN unsigned int nAlignment);


MV_CAMCTRL_API int __stdcall MV_CC_FreeAlignedBuffer(IN void* pBuffer);


MV_CAMCTRL_API int __stdcall MV_CC_GetPayloadSize(IN void* handle, IN OUT uint64_t* pnPayloadSize, IN OUT unsigned int* pnAlignment);


MV_CAMCTRL_API int __stdcall MV_CC_RegisterBuffer(IN void* handle, IN void *pBuffer, IN uint64_t nBufSize, IN void* pUser);


MV_CAMCTRL_API int __stdcall  MV_CC_UnRegisterBuffer(IN void* handle, IN void* pBuffer);


/**************************Part12 ch: 支持串口通信的设备接口 | en: API for devices supporting serial communication ******************************************/
MV_CAMCTRL_API int __stdcall MV_CC_SerialPort_Open(IN void* handle);

MV_CAMCTRL_API int __stdcall MV_CC_SerialPort_Write(IN void* handle, IN const void *pBuffer, IN unsigned int nLength, OUT unsigned int* pnWriteLen);

MV_CAMCTRL_API int __stdcall MV_CC_SerialPort_Read(IN void* handle, IN void *pBuffer, IN unsigned int nLength, OUT unsigned int* pnReadLen, IN unsigned int nMsec);


MV_CAMCTRL_API int __stdcall MV_CC_SerialPort_ClearBuffer(IN void* handle);


MV_CAMCTRL_API int __stdcall MV_CC_SerialPort_Close(IN void* handle);


#ifdef __cplusplus
}
#endif 

#endif //_MV_CAMERA_CTRL_H_
