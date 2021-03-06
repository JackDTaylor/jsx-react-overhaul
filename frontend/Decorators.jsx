/**
 * @typedef PropertyDescriptorWithInitializer
 * @extends PropertyDescriptor
 * @property initializer {Function}
 */
import JsxReactUtils from "../base/JsxReactUtils";

export default () => {
	global.StateProperty = class StateProperty {
		constructor(config = {}) {
			Object.assign(this, config);
		}
	};

	global.state = function state(proto, field, descriptor) {
		const initializer = descriptor.initializer;

		let initialValue = initializer && initializer();
		let config = new StateProperty;

		if(initialValue instanceof StateProperty) {
			config = initialValue;
			initialValue = config.value;
		}

		// console.log('Proto UID', field, ObjectUID(proto), proto);

		const cancelPromise = promise => {
			if(!promise) {
				return;
			}

			if(!isBluebirdPromise(promise)) {
				if(JsxReactUtils.config('log.vanillaPromiseUsageWarnings')) {
					console.warn(
						'JsxReactUtils @state decorator was unable to cancel state update promise. '+
						'You should either use Bluebird, don\'t use @state decorator or be ready for any kind of weird issues.'
					);
				}

				return;
			}

			promise.cancel();
		};

		proto.componentWillUnmount = (originalCall => function() {
			this.state$componentIsUnmounting = true;

			return originalCall.apply(this, arguments);
		})(proto.componentWillUnmount || (() => {}));

		proto.state$initDeferred = function state$initDeferred() {
			if('state$deferred' in this == false) {
				// console.log(this.constructor.name + this.id + ':ClearDeferStateA');
				this.state$deferred = {};
				this.state$deferredPromise = null;
				this.state$componentIsUnmounting = false;
			}
		};

		proto.state$applyDeferred = function state$applyDeferred() {
			this.allowRender = true;

			if(!this.state$deferred || this.state$componentIsUnmounting) {
				return;
			}

			this.setState(this.state$deferred);

			this.state$deferred = {};
		};

		proto.commitState = function() {
			cancelPromise(this.state$deferredPromise);
			this.state$deferredPromise = null;

			this.state$applyDeferred();
		};

		return {
			get() {
				this.state$initDeferred();

				if(field in this.state$deferred) {
					return this.state$deferred[field];
				}

				if(!this.state || field in this.state == false) {
					if(!this.state) {
						// I'm pretty sure this led to some pretty severe errors and warnings before, but now I haven't been able to
						// find the error message even in React sources themselves. So it's either I gone insane after all or
						// you may face the same error and this non-documented and disabled by default config option you've never
						// heard of could've cleared things up a bit if you did find it. But you probably didn't.
						//
						// ...but if you did, you now have my official permission to report the issue at https://github.com/JackDTaylor/jsx-react-utils/issues/new
						if(JsxReactUtils.config('log.stateDecorator.warnOnStateInit')) {
							console.warn(
								`${this.constructor.name}.${field}: Initializing empty state in @state decorator getter. ` +
								'This may lead to warnings like "Cannot assign to state not in constructor".\n' +
								'Make sure your `this.state` object was initialized before using @state-decorated properties ' +
								'if you want to use state with this component'
							);
						}

						this.state = {};
					}

					this.state[field] = initialValue;
				}

				return this.state[field];
			},

			set(value) {
				this.state$initDeferred();

				const context = {stop: false};

				if(config.set) {
					value = config.set.apply(this, [value, context]);
				}

				if(context.stop) {
					return;
				}

				// console.log(this.constructor.name + this.id + ':SetState', field);
				// this.setState({ [field]: value });

				this.stateHash = `${this.stateHash}`.md5();
				this.state$deferred[field] = value;

				cancelPromise(this.state$deferredPromise);

				this.state$deferredPromise = delay().then(() => this.state$applyDeferred());
			}
		};
	};

	global.prop = function prop(proto, field, descriptor) {
		return {
			get() {
				if(field in this.props == false || isUndefined(this.props[field])) {
					return descriptor.initializer && descriptor.initializer.call(this);
				}

				return this.props[field];
			}
		};
	};

	global.ref = function ref(proto, field) {
		proto.constructor.Refs = proto.constructor.Refs || [];
		proto.constructor.Refs.push(field);

		return {
			configurable: true,

			get() {
				return this.ref[field].current;
			}
		};
	};

	global.hook = function hook(proto, field, descriptor) {
		const defaultRenderer = DecoratorUtils.getInitialValue(proto, field, descriptor, () => '');

		const hasHooked    = `has${field.ucFirst()}`;
		const beforeHooked = `before${field.ucFirst()}`;
		const renderHooked = `render${field.ucFirst()}`;
		const afterHooked  = `after${field.ucFirst()}`;

		Object.defineProperty(proto, hasHooked, {
			enumerable: false,
			configurable: true,

			get() {
				return true;
			}
		});

		Object.defineProperty(proto, beforeHooked, {
			enumerable: false,
			configurable: true,

			value() {
				return undefined;
			}
		});

		Object.defineProperty(proto, renderHooked, {
			enumerable: false,
			configurable: true,

			value() {
				return defaultRenderer.apply(this);
			}
		});

		Object.defineProperty(proto, afterHooked, {
			enumerable: false,
			configurable: true,

			value() {
				return undefined;
			}
		});

		return {
			enumerable: false,
			configurable: true,

			get() {
				if(this[hasHooked] == false) {
					return '';
				}

				return (
					<___>
						{this[beforeHooked]()}
						{this[renderHooked]()}
						{this[afterHooked]()}
					</___>
				);
			}
		}
	};
}