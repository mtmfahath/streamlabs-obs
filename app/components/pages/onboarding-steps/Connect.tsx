import { Component } from 'vue-property-decorator';
import electron from 'electron';
import { UserService, EAuthProcessState } from 'services/user';
import { TPlatform, EPlatformCallResult } from 'services/platforms';
import { Inject } from 'services/core/injector';
import { OnboardingService } from 'services/onboarding';
import TsxComponent, { createProps } from 'components/tsx-component';
import { $t } from 'services/i18n';
import styles from './Connect.m.less';
import ListInput from 'components/shared/inputs/ListInput.vue';
import ExtraPlatformConnect, { TExtraPlatform } from './ExtraPlatformConnect';
import { IListOption } from '../../shared/inputs';
import { UsageStatisticsService } from 'services/usage-statistics';

class ConnectProps {
  continue: () => void = () => {};
}

@Component({ props: createProps(ConnectProps) })
export default class Connect extends TsxComponent<ConnectProps> {
  @Inject() userService: UserService;
  @Inject() onboardingService: OnboardingService;
  @Inject() usageStatisticsService: UsageStatisticsService;

  selectedExtraPlatform: TExtraPlatform | '' = '';

  get loading() {
    return this.userService.state.authProcessState === EAuthProcessState.Busy;
  }

  async authPlatform(platform: TPlatform) {
    this.usageStatisticsService.recordAnalyticsEvent('PlatformLogin', platform);
    const result = await this.userService.startAuth(
      platform,
      platform === 'youtube' ? 'external' : 'internal',
    );

    if (result === EPlatformCallResult.TwitchTwoFactor) {
      electron.remote.dialog
        .showMessageBox({
          type: 'error',
          message: $t(
            'Twitch requires two factor authentication to be enabled on your account in order to stream to Twitch. ' +
              'Please enable two factor authentication and try again.',
          ),
          title: $t('Twitch Authentication Error'),
          buttons: [$t('Enable Two Factor Authentication'), $t('Dismiss')],
        })
        .then(({ response }) => {
          if (response === 0) {
            electron.remote.shell.openExternal('https://twitch.tv/settings/security');
          }
        });
    } else {
      // Currently we do not have special handling for generic errors
      this.props.continue();
    }
  }

  iconForPlatform(platform: TPlatform) {
    if (this.loading) return 'fas fa-spinner fa-spin';

    return {
      twitch: 'fab fa-twitch',
      youtube: 'fab fa-youtube',
      mixer: 'fas fa-times',
      facebook: 'fab fa-facebook',
    }[platform];
  }

  get isSecurityUpgrade() {
    return this.onboardingService.options.isSecurityUpgrade;
  }

  get securityUpgradeLink() {
    return (
      <span>
        {$t(
          'We are improving our backend systems. As part of the migration process, we will need you to log in again. If you have any questions, you can ',
        )}
        <a onClick="contactSupport">{$t('contact support.')}</a>
      </span>
    );
  }

  contactSupport() {
    electron.remote.shell.openExternal('https://support.streamlabs.com');
  }

  onSkip() {
    if (this.loading) return;
    this.props.continue();
  }

  selectOtherPlatform(platform: TExtraPlatform) {
    this.usageStatisticsService.recordAnalyticsEvent('PlatformLogin', platform);
    this.selectedExtraPlatform = platform;
  }

  render() {
    if (this.selectedExtraPlatform) {
      return (
        <ExtraPlatformConnect
          continue={this.props.continue}
          platform={this.selectedExtraPlatform}
          back={() => (this.selectedExtraPlatform = '')}
        />
      );
    }

    return (
      <div class={styles.container}>
        <div class={styles.progressCover} />
        <h1>{this.isSecurityUpgrade ? $t('Re-Authorize') : $t('Connect')}</h1>
        <p>
          {this.isSecurityUpgrade
            ? this.securityUpgradeLink
            : $t('Sign in with your streaming account to get started with Streamlabs OBS')}
        </p>
        <div class={styles.signupButtons}>
          {['twitch', 'youtube', 'mixer', 'facebook'].map((platform: TPlatform) => (
            <button
              class={`button button--${platform}`}
              disabled={this.loading}
              onClick={() => this.authPlatform(platform)}
            >
              <i class={this.iconForPlatform(platform)} />{' '}
              {platform.charAt(0).toUpperCase() + platform.slice(1)}
            </button>
          ))}
        </div>
        <p class={styles['select-another']}> {$t('or select another platform')} </p>
        <ListInput
          onInput={this.selectOtherPlatform}
          metadata={{
            allowEmpty: true,
            name: 'otherPlatform',
            placeholder: $t('Select platform'),
            options: [
              {
                value: 'dlive',
                title: 'Dlive',
                icon: require('../../../../media/images/platforms/dlive-logo-small.png'),
              },
              {
                value: 'nimotv',
                title: 'NimoTV',
                icon: require('../../../../media/images/platforms/nimo-logo-small.png'),
              },
            ] as IListOption<TExtraPlatform>[],
          }}
        />
        <p>
          <br />
          <span class={styles['link-button']} onClick={this.onSkip}>
            {$t('Skip')}
          </span>
        </p>
      </div>
    );
  }
}
