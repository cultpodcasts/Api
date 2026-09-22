import { JwtPayload } from '@cfworker/jwt';

export interface Auth0JwtPayload extends JwtPayload {
    azp: string;
    /** Present on some Auth0 M2M tokens instead of / alongside azp. */
    client_id?: string;
    /** Auth0 client_credentials grant type claim. */
    gty?: string;
    scope: string;
    permissions: string[];
}
