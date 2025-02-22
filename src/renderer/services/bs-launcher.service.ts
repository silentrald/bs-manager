import { LaunchOption, BSLaunchEvent, BSLaunchWarning, BSLaunchEventData, BSLaunchError } from "shared/models/bs-launch";
import { BSVersion } from 'shared/bs-version.interface';
import { IpcService } from "./ipc.service";
import { NotificationService } from "./notification.service";
import { BehaviorSubject, Observable, lastValueFrom, tap } from "rxjs";
import { ConfigurationService } from "./configuration.service";
import { ThemeService } from "./theme.service";
import { BsStore } from "shared/models/bs-store.enum";
import { ModalExitCode, ModalService } from "./modale.service";
import { EnableOculusSideloadedApps } from "renderer/components/modal/modal-types/enable-oculus-sideloaded-apps";
import { CustomError } from "shared/models/exceptions/custom-error.class";
import { sToMs } from "shared/helpers/time.helpers";
import { NeedLaunchAdminModal } from "renderer/components/modal/modal-types/need-launch-admin-modal.component";

export class BSLauncherService {
    private static instance: BSLauncherService;

    private readonly ipcService: IpcService;
    private readonly notificationService: NotificationService;
    private readonly config: ConfigurationService;
    private readonly theme: ThemeService;
    private readonly modals: ModalService;

    public readonly versionRunning$: BehaviorSubject<BSVersion> = new BehaviorSubject(null);

    public static getInstance(){
        if(!BSLauncherService.instance){ BSLauncherService.instance = new BSLauncherService(); }
        return BSLauncherService.instance;
    }

    private constructor() {
        this.ipcService = IpcService.getInstance();
        this.notificationService = NotificationService.getInstance();
        this.config = ConfigurationService.getInstance();
        this.theme = ThemeService.getInstance();
        this.modals = ModalService.getInstance();
    }

    private notRewindBackupOculus(): boolean{
        return this.config.get<boolean>("not-rewind-backup-oculus");
    }

    private setNotRewindBackupOculus(value: boolean): void{
        this.config.set("not-rewind-backup-oculus", value);
    }

    public getLaunchOptions(version: BSVersion): LaunchOption{
        return {
            version,
            launchMods: this.config.get("launch-mods") ?? [],
            additionalArgs: (this.config.get<string>("additionnal-args") || "").split(";").map(arg => arg.trim()).filter(arg => arg.length > 0),
        }
    }

    private handleLaunchEvents(events$: Observable<BSLaunchEventData>): Observable<BSLaunchEventData>{
        const eventToFilter = [...Object.values(BSLaunchWarning), BSLaunchEvent.STEAM_LAUNCHED]

        return events$.pipe(tap({
            next: event => {
                if(eventToFilter.includes(event.type)){ return; }
                this.notificationService.notifySuccess({title: `notifications.bs-launch.success.titles.${event.type}`, desc: `notifications.bs-launch.success.msg.${event.type}`});
            },
            error: (err: CustomError) => {
                if(!err?.code || !Object.values(BSLaunchError).includes(err.code as BSLaunchError)){
                    this.notificationService.notifyError({title: "notifications.bs-launch.errors.titles.UNKNOWN_ERROR", desc: "notifications.bs-launch.errors.msg.UNKNOWN_ERROR"});
                } else {
                    this.notificationService.notifyError({title: `notifications.bs-launch.errors.titles.${err.code}`, desc: `notifications.bs-launch.errors.msg.${err.code}`, duration: sToMs(9)})
                }
            }
        }))
    }

    private async doMustStartAsAdmin(): Promise<boolean> {
        const needAdmin = await lastValueFrom(this.ipcService.sendV2("bs-launch.need-start-as-admin"));
        if(!needAdmin){ return false; }
        if(this.config.get("dont-remind-admin")){ return true; }
        const modalRes = await this.modals.openModal(NeedLaunchAdminModal);
        if(modalRes.exitCode !== ModalExitCode.COMPLETED){ throw new Error("Admin launch canceled"); }
        this.config.set("dont-remind-admin", modalRes.data);
        return true;
    }

    private async enableSideloadedAppsIfNeeded(): Promise<void> {
        if(window.electron.platform !== "win32"){ return; }
        const isSideloadedAppsEnabled = await lastValueFrom(this.ipcService.sendV2("is-oculus-sideloaded-apps-enabled"));
        if(isSideloadedAppsEnabled){ return; }

        const modalRes = await this.modals.openModal(EnableOculusSideloadedApps);

        if(modalRes.exitCode !== ModalExitCode.COMPLETED){
            throw new Error("Enable sideloaded apps canceled");
        }

        await lastValueFrom(this.ipcService.sendV2("enable-oculus-sideloaded-apps"));
    }

    public doLaunch(launchOptions: LaunchOption): Observable<BSLaunchEventData>{
        return this.ipcService.sendV2("bs-launch.launch", launchOptions);
    }

    public launch(launchOptions: LaunchOption): Observable<BSLaunchEventData> {

        return new Observable<BSLaunchEventData>(obs => {
            (async () => {

                // If downgraded from oculus and its not the official version
                if(launchOptions.version.metadata?.store === BsStore.OCULUS && !launchOptions.version.oculus){
                    await this.enableSideloadedAppsIfNeeded();
                }

                if(launchOptions.version.metadata?.store !== BsStore.OCULUS){
                    launchOptions.admin = await this.doMustStartAsAdmin();
                }

                const launch$ = this.handleLaunchEvents(this.doLaunch(launchOptions));

                await lastValueFrom(launch$);

            })().then(() => {
                obs.complete();
            }).catch(err => {
                obs.error(err);
            })
        });

    }

    public createLaunchShortcut(launchOptions: LaunchOption, steamShortcut: boolean): Observable<boolean>{
        const options: LaunchOption = {...launchOptions, version: {...launchOptions.version, color: launchOptions.version.color || this.theme.getBsmColors()[1]}};
        return this.ipcService.sendV2("create-launch-shortcut", { options, steamShortcut });
    }

    public restoreSteamVR(): Promise<void>{
        return lastValueFrom(this.ipcService.sendV2("bs-launch.restore-steamvr"));
    }
}
