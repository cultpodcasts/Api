import { Env } from './Env';

export type AppContext = {
	Bindings: Env;
	Variables: {
		auth0: (payload: any) => any;
	};
};
